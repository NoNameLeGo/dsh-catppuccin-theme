# issue #31：快速切换风味偶发失败（迟到的文档回声回滚）

- 状态：**根因已定位（本机官方桌面壳 CDP 实测复现）+ 修复已实施并随 `0.6.5-beta.2` 发预发布**。
- 报告形态：维护者口述「快速切换配色主题时偶发失败」；无上游 issue，编号按本次工作顺序记为 #31。
- 复现环境：官方桌面壳 `@deepseek-ai/dsh-desktop/0.2.1-rc.3`（Electron 44.7 / Chromium 152）、
  profile `desktop`（`@nonamelego/dsh-catppuccin` 为**符号链接**指向仓库，2026-10-27 实测可解析）、
  CDP 端口 9333、设置页 → Catppuccin → 四个风味按钮。

> 本文的结论全部来自**写入者归属**取证：把 `Storage.prototype.setItem` 包一层，只记
> `dsh.catppuccin.flavor`，并打出 `new Error().stack` —— 于是一眼能分清某次写入是
> `select()`（用户点击）还是 `applyScopeSnapshot`（采纳文档）。脚本见 `.debug/theme-race/`
> （`.debug/` 已 gitignore）。

## 1. 现象

连续点几个风味，**最后一次偶发不生效**：界面切过去、随后又被切回上一个；`localStorage` 与
`cordis.patch.yml` 也一起回到旧值；更新行**没有**出现「另一窗口已更新」的冲突提示（静默丢失）。

## 2. 实测时间线（三次试验，两次复现）

单点试验（先点 macchiato 落盘，再点 latte）：

| 事件 | 偏移 | 写入者（栈顶三帧） | 值 |
|---|---|---|---|
| 点击 latte | +0 ms | `select → writeFlavor` | `catppuccin-latte` |
| 快照到达 | **+1439 ms** | `applyScopeSnapshot → writeFlavor` | `catppuccin-macchiato` |
| 排队的 flush | 之后 | `persistLocal → stateToMutateOps` | `catppuccin-macchiato`（写进文档） |

结论：**先生效、再被自己早先那笔写的回声覆盖，最后把覆盖后的值持久化**。三次单点试验 2 次复现；
3 连点（200 ms 间隔）也复现（+2.8 s 回滚到更早的值）；`banner: null`，即冲突不计、不提示。

## 3. 根因

采纳路径缺一道「本地是否还有更晚、尚未落盘的意图」的判据。

`applyScopeSnapshot()` 的既有判据只有一条：`本地 section == 文档 section` → 视为自己的回声跳过。
但它**不知道本地刚有一次变更还在防抖队列里或在途**，于是把「自己早先那笔写的回声」当成外部真相，
按「文档优先」把更新的本地选择覆盖掉；而排队的 `persistLocal` 在 flush 时才 `buildLocalState()`，
读到的正是被覆盖后的值 ⇒ 回滚被写进文档，损失变成永久的，且 `persistStateToScope` 此时判成
`written`/`noop` 而不是 `stale`，所以连 `emitConflict()` 都不会触发。

写侧（`persistStateToScope`）有 `baseRevision` 读侧守卫 + `ourOwnEcho` 指纹两道护栏，
读侧（`applyScopeSnapshot`）一道都没有——**两侧从一开始就不对称**。R2 的 `pendingLocalPush`
只覆盖「scope 还不可用」的 boot 窗口，这里 scope 是可用的。

触发窗口 = **从「点击」到「自己那笔写的回声落地」**：前台大约 300 ms 防抖 + 一次往返；窗口隐藏时
Chromium 把定时器节流到 ~1 s，窗口被拉宽（这正是本机复现率偏高的原因，不是用户环境更差）。

## 4. 修法（`src/client/index.ts`）

| # | 改动 | 作用 |
|---|---|---|
| P1 | `queuePersist()` 记录 `pendingLocalSection`（本地最新 section；flush 结清才清空；`'error'` 故意保留，下次 flush 重试） | 采纳前的第一道闸：有未落盘意图且快照 ≠ 该意图 ⇒ 不采纳 |
| P2 | 命名空间 revision 高水位 `maxSeenRevision`（`revisionKind` 变则重置） | 第二道闸：revision **倒退**的快照 = 过期视图（迟到的 describe 读 / 被后写覆盖的答复） |
| P3 | 真正采纳时 `cancelDurablePersist()` + `baseRevisionTracker.take()` + 清 `pendingLocalSection`，并把 `syncedSection` / `lastDocumentSection` **提前**到写入之前 | 不把回滚值写盘；`glass.applyRemote` 会 republish → `queuePersist`，基线先到位才不会误 arm |
| P4 | `reapplyThemePrefs()` 只回收**活跃**风味，并在同一同步块内 `setTheme` 补回 | 上游 `register()` 的 disposer 会把当前偏好重置成默认值（原文：「Disposing the theme backing the active preference resets the preference to the default」），原来全靠 microtask 拉回，丢一次就是「点了没反应」 |
| P5 | restore 走 `commitTheme(id, false)`（不记录 `liveBuiltinPick`）；`select()` 的 `setTheme` 失败改为「强制重注册重试一次 → 仍失败则回滚缓存 + `emitConflict()`」；`scheduleRestore` 记住**最后一个** desired | 消除「缓存=新风味、UI=旧风味」的半吊子态，以及「关掉风味被记成一次 dark 选择」导致风味再也恢复不了 |

`pendingLocalSection` 还多一个条件：只有当本地 section **也不等于** `lastDocumentSection`
（最近一次真正成立的文档 section）时才 arm。否则「采纳自身」引起的 republish 会 arm 一个假的
「未落盘意图」，把下一次外部编辑挡满一个防抖周期（首版实现就踩了这个，测试当场抓到）。

## 5. 测试与变异

`tests/reentrancy.spec.ts` 新增 `describe('issue #31: a late document echo must not revert a newer local change')`，
5 条：回声不覆盖新选择 / 过期视图不采纳但**新编辑仍采纳** / 回收注册时偏好不掉 / `off` 恢复不算一次 pick /
注册被跳过时的重试与回滚。测试 373 → **378**。

五组变异**全部验证会红**：去掉 P1 ⇒ 首条红；去掉 P2 ⇒ 第 2 条红；`reapplyThemePrefs` 改回 dispose-all ⇒
第 3 条红；`applyRestoredPreference` 改成记录 ⇒ 第 4 条红；去掉强制重注册 ⇒ 第 5 条红。

## 6. 未做 / 已知取舍

1. **前台真机复测未跑**：本轮壳窗口是 `visibilityState === 'hidden'`（`Emulation.setFocusEmulationEnabled`
   与 `Page.setWebLifecycleState('active')` 都改不了），定时器被节流到 ~1 s。需要在**前台**手动连点
   10 次（间隔 120/300/600 ms）复核：`applyScopeSnapshot` 不应再出现 `writeFlavor`，文档终值 = 最后一次点击。
2. **`'error'` 保留意图**：传输失败时 `pendingLocalSection` 不清空，因此那段时间外部编辑会被挡住，
   直到下一次 flush 成功。这是有意的（宁可等，也不静默丢掉用户的选择）。
3. **跨窗口真冲突**：本地有未落盘意图时，外部编辑会被 P1 挡住一拍，随后由 flush 的 `baseRevision`
   守卫判成 `stale` → 采纳 + 冲突横幅。语义仍是「文档优先」，只是顺序变了。
4. `scheduleRestore` 的「记住最后一个 desired」没有独立用例（可达路径需要同一个 task 内两次不同
   `applyDesired` 观察），由 P4 的用例间接覆盖。

## 7. 复现脚本（`.debug/theme-race/`，未入库）

| 文件 | 作用 |
|---|---|
| `run2.mjs` | 节点侧驱动的连点探针（gap / 次数 / 目标风味可配），记录每次点击后的 `aria-pressed` + `localStorage` |
| `run4.mjs` | **写入者归属**探针：包 `setItem` 打栈，输出每次 `dsh.catppuccin.flavor` 写入的调用链与时间 |
| `send.mjs` | 发单条 CDP 命令（`Emulation.*` / `Page.*` 试验用） |

起壳：`env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS -u WORKBUDDY_CLIENT_USER_AGENT "./DeepSeek Harness.exe" --remote-debugging-port=9333`
（少了这两个 `-u`，exe 会被当 node 跑，报 `bad option`）。设置页靠点击 `span` 文本为「设置」的按钮 →
再点 `Catppuccin` 打开；风味按钮选择器 `[data-catppuccin-settings] [role="group"] button[aria-pressed]`。
