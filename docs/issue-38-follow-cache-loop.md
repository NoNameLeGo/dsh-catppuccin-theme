# issue #38：双端 `followDark` 回写死循环

- 状态：**根因已定位（jsdom 双 origin 复现）+ 修复已实施**，待维护者按 `0.7.1` 发版。
- 报告：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/38>（`@Henvy-Mango`，2026-11-06）。
- 报告环境：`@nonamelego/dsh-catppuccin@0.7.0` + DSH Desktop `0.2.2-rc.1`（macOS），两个 origin——
  桌面壳 `dsh-app://app` 与经 `dsh-porthole` 的局域网 Web `http://192.168.x.x:3082`。
- 报告观测：无操作时 `cordis.patch.yml` 每 0.6–1.5 s 被重写，`followDark` 在 `catppuccin-mocha` /
  `catppuccin-frappe` 之间来回翻；`/api/settings/describe` 里只有 `dsh-catppuccin` 命名空间的
  revision 在涨（约 0.8 次/秒，1378 → 1553 / 3 分钟）。

## 1. 根因

`src/client/index.ts` 的 `applyScopeSnapshot()` 采纳远端 section 时，把 section 写回 localStorage 的
**手抄清单只有 6 项**，`#36` 新增的 `followSystem` / `followDark` 不在其中；`pendingLocalPush` 的
重放分支同样是这 6 项。而 `readFollowDark()` 在 key 缺失时回落默认值 `catppuccin-mocha`。

于是形成闭环（两个 origin 各自缓存一个值）：

1. A 采纳文档，但**没把 `followDark` 缓存下来** → 本地仍读旧值；
2. 采纳里的 `glass.applyRemote` 同步重发布 → `queuePersist` 判定「本地 ≠ 文档」→ 武装 pending 并排 flush；
3. flush 把 A 的旧值整段写回文档 → 文档 revision +1 → B 收到 `settings/document-updated`；
4. B 同样不缓存 → 同样回写 → 回到 1。

只有 `dsh-catppuccin` 命名空间在涨，是因为其它命名空间没有这种「本地缓存 vs 文档」双份状态。

**这是 `0.7.0` 引入的回归**：`0.6.6` 的 section 正好是这 6 个字段，当时清单是完整的。

## 2. 实测（三次运行，同一份 jsdom 双 origin 复现）

复现脚本：一个 origin 缓存 `followDark: catppuccin-frappe`，文档（带 user layer）解析出
`catppuccin-mocha`，挂载 client 后等 700 ms（boot + 300 ms 去抖 flush）。

| 变体 | 采纳后的缓存 | 回写次数 | 之后另一窗口提交新值能否采纳 |
|---|---|---|---|
| `0.7.0` 原样 | `frappe`（没采纳） | 1 | 不能（同一根因） |
| 把两行追加在采纳块**末尾**（报告人建议的位置） | `mocha` ✅ | 0 ✅ | **不能** ❌（缓存停在 `mocha`） |
| 把两行写在 `glass.applyRemote`**之前**（本修复） | `mocha` ✅ | 0 ✅ | `macchiato` ✅ |

**为什么末尾不行**：`glass.applyRemote` 里的 `sync()` 会**同步**发布 `theme/change`，`glass.subscribe`
随即跑 `queuePersist`，而它在那一瞬就 `buildLocalState()` 取快照。follow 字段此时还没落盘 ⇒
`pendingLocalSection` 被武装成一个**没有任何 flush 能对上账**的 section（flush 重算出来的是新值，
`settled` 比较永远不等，`src/client/index.ts` 的 `written`/`noop` 两支都不会清它）。之后 #31 守卫 1
就按那个过期 section 拒绝一切外部编辑，直到用户下次真实改动把它覆盖。

## 3. 修复

1. 新增 `writeLocalSection(section, glass)`（`src/client/index.ts`）：**唯一**的「section → localStorage」
   入口，用 `{ [K in keyof CatppuccinSettingsSection]: (value: never) => void }` 映射类型表驱动，
   漏一个字段就编译失败；`glass` 排在最后（理由见 §2）。
2. 两处手抄清单（重放分支 + 采纳分支）改为调用它。
3. 同类隐患一并收口：
   - `CatppuccinConfig.glass`（`src/settings-catppuccin.ts`）漏 `glowSize` / `glow`，补上；
   - `tests/state.spec.ts` 里名为「compares every field」的用例实际只测 6 个字段 → 改成按
     `defaultSettingsSection()` 派生 mutants（`sectionMutants()` / `sectionFieldPaths()`），
     `isDefaultState` 的用例同样改成派生；
   - `stateToMutateOps` 的「新字段必须同时进 4 处」注释补上第 4 处（采纳写回）。

## 4. 测试

`tests/follow-adopt.spec.ts`（新）：

1. `writeLocalSection` 写入全非默认 section，逐个 reader 读回（漏 writer / 写错 key 都会红）；
2. 玻璃层拿到的时机：`applyRemote` 被调用时 follow 两个 key 已在盘上（把「glass 最后」变成断言）；
3. 采纳文档后缓存跟随文档、且**不排任何写入**（循环本身）；
4. 采纳之后，另一窗口提交的新值仍能被采纳（钉住顺序，末尾追加的变体会在这里红）。

全量：`npx vitest run --no-file-parallelism` → 24 文件 / 429 用例全绿；`tsc --noEmit` 两套配置均通过。

## 5. 边界与残留

- **文档由 ≤ `0.6.6` 写入（没有 follow 字段）**：解析成默认值 ⇒ 采纳后本地跟随值被重置为 Mocha（一次性，
  与其它字段的「文档胜」一致）。不引入「absent ≠ 默认」语义：那需要 null 贯通 state / sanitize / Host
  schema / 写入 op，代价远大于收益（先例是 `readExplicitFlavorOff`，只对 flavor 开了一个口子）。
- **宿主没有 `overrideTokens`**：文档里的 `followSystem: true` 原样采纳、**不按能力裁剪**。裁剪会让
  两端互推（一端裁成本地 false、另一端文档 true），正好重造本 bug；降级由 `applyDesired` 负责，开关本来也不渲染。
- **混合版本两端**：旧版插件仍会整段写（缺 follow ⇒ 默认）⇒ 新版采纳后不反击 ⇒ 收敛到默认值，不循环。
- **同一 origin 多窗口**：采纳写缓存会触发 `storage` 事件，`onStorage` 已处理这两个 key。
- 未纳入本 issue：Host 崩溃（报告里提到但无因果证据，需对方的崩溃日志与版本）。
