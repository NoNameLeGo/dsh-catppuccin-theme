# issue #30：新 origin 首次加载把配置重置为默认值

> 报告人：`ripley-xl`（2026-10-27，OPEN，0 评论）
> 环境：插件 `0.6.4` / DSH `0.2.1-rc.3`（Linux，`dsh web`，profile `web`）/ Chrome 151 / 全新
> `--user-data-dir`。报告人已给出复现、注入日志、根因定位与一份自测通过的补丁。
>
> **结论：报告正确，采纳其方向（"文档就绪后只回放真正变化过的字段"），但补丁本身有两个必须修的点
> （见 §4.4）。定性 = bug 修复 ⇒ `0.6.5` 线。**
>
> **状态：已实施（2026-10-27，`0.6.5-beta.0`）。** 实施与本节方案的差异只有两条，都是收紧：
> ① 基线叫 `syncedSection` 且在**每个同步点**刷新（方案 §4.1 已要求）；② 玻璃订阅的收窄（P3）一并做了，
> 因此 `tests/reentrancy.spec.ts` 的两条 issue #15 用例的 fixture 补上了"ready 的 form 一定解析出
> section"（原先靠 `value: undefined` 下的盲写来产生 mutation，而那正是本次要关掉的那类写）。
> 测试 **353 → 360**，三组变异已验证会红（见 CHANGELOG 的 `[Unreleased]` 节）。

## 1. 症状与影响面

`cordis.patch.yml` 里的 `dsh-catppuccin.config` 被**真实改写**为出厂默认：

```
flavor: catppuccin-frappe → off
glass.enabled: true       → false
glass.mode: compat        → mica
```

页面随之退回官方深色 + 玻璃层撤销（`data-dsh-glass*` 全丢），localStorage 只剩
`dsh.catppuccin.restore`。触发条件是 **localStorage 为空的 origin**：

| 入口 | 说明 |
|---|---|
| VS Code DSH 面板（webview iframe） | 存储分区 / opaque origin ⇒ 读不到旧缓存 |
| DSH Desktop 每次随机端口 | README 自己写过的 per-launch port churn，**持续**制造新 origin |
| 清站点数据 / 换浏览器 / `localhost` ↔ `127.0.0.1` | 同 origin-policy 后果 |

与 README FAQ「换浏览器、清站点数据、自定义端口或再开一个桌面实例，偏好都不会丢」直接冲突，
而 Desktop 的随机端口意味着这不是边角场景。

## 2. 报告人环境声明的一处校正

报告人写"`dsh.compatibility` 只声明验证到 `0.2.1-rc.2`，rc.3 不在声明范围内"。**当前工作区已经不成立**：
`package.json` 的 `dshReleases` / `dshOperations` 已各含 `0.2.1-rc.3`（`docs/issue-0.2.1-rc.3-adaptation-audit.md`
那一轮改的，**尚未提交**）。这条不需要再动作，但 0.6.5 提交时会一并带上，发版说明里可以顺带澄清。

报告人的另一句判断是对的：竞态在插件侧，与宿主哪个 rc 无关。

## 3. 根因（已按源码复核）

链路（编号为 `src/client/index.ts` 行号）：

1. `buildLocalState()`（481-492）的每一字段都是**读 localStorage**，空 origin ⇒ 全部落回出厂默认。
2. `queuePersist()`（545-554）在 scope 还不可用时置 `pendingLocalPush = true`（R2 机制，本意是
   "boot 窗口内的用户改动不能被首个快照回滚"）。
3. **触发点不是用户操作**：`glass.subscribe(() => queuePersist())`（712-714）。`GlassLayer` 在
   `theme/change` 上无条件 `publish()`（`glass-layer.ts:289-293`），而 `ui-theme` 的 `adopt()` 在每次
   boot / 设置文档重载时都会写一次偏好 ⇒ **正常加载就必然产生一次 glass publish**，此时 scope 仍在
   `loading` ⇒ `pendingLocalPush = true`。构造函数末尾的 `sync()` 也会 publish 一次。
4. `applyScopeSnapshot()`（727-775）拿到首个 ready 快照后，`pendingLocalPush` 分支（736-740）
   **`queuePersist(); return;`** —— 不采纳文档，直接回写。
5. `persistLocal()`（555-570）→ `persistStateToOps(stateToMutateOps)`（`state-sync.ts:292-314`）
   **一次写全 11 个字段** ⇒ 默认值把文档整段覆盖。

即：**"排在等待窗口里的东西"被当成了"用户的改动"，而它实际上只是出厂默认。** 是否命中取决于
300ms debounce 与设置文档到达时间的相对先后（报告人在 x8 throttle 下 1 次命中、正常速度多轮不命中）。

## 4. 修法

三条独立、可分别提交的改动。**P1 是必须的；P2/P3 是同一根因的收窄（去掉"无变化也排写入"）。**

### 4.1 P1（核心）：文档就绪后按**字段增量**回放，不再整段回写

`src/state.ts` 新增纯函数（可单测，且把"新增字段必须登记"的坑显式化）：

```ts
/**
 * Replay the local changes a window made BEFORE the durable channel became
 * usable onto the document state (issue #30). Only the fields whose value
 * moved away from `baseline` — the local section at the last sync point — are
 * carried; everything else keeps the document's value.
 *
 * ⚠️ Every field of `CatppuccinSettingsSection` must be listed here. A missing
 * one is SILENT in both directions: a boot-window change to it is dropped, or
 * (if the caller falls back to a whole-state write) it clobbers the document.
 * Same rule as `stateToMutateOps` (issue #26).
 */
export function replayLocalChanges(
  doc: CatppuccinState,
  baseline: CatppuccinSettingsSection,
  local: CatppuccinSettingsSection,
): { state: CatppuccinState; changed: boolean }
```

实现：`merged = settingsSectionFromState(doc)`（已 clone），逐字段
`flavor / glass.{enabled,mode,blur,frost,brightness,glow} / autoCheck / updateChannel / shikiStyle`
比较 `local` vs `baseline` 后覆盖并置 `changed`；`overrides` 按**整张 map** 比较与接管
（4 行的 `sameOverrides`，语义等同 `settingsSectionsEqual` 里的双向 key 比较）；末尾
`sanitizeState(merged)`。

`src/client/index.ts`：

```ts
  let syncedSection = settingsSectionFromState(buildLocalState())   // 同步点基线

  const applyScopeSnapshot = (): void => {
    const snapshot = scope.getSnapshot()
    const state = durableStateFromSnapshot(snapshot)
    if (state === null) return
    const local = buildLocalState()
    if (pendingLocalPush) {
      pendingLocalPush = false
      const replayed = replayLocalChanges(state, syncedSection, settingsSectionFromState(local))
      if (replayed.changed) {
        writeFlavor(replayed.state.flavor)
        glass.applyRemote(replayed.state.glass)
        writeAutoCheck(replayed.state.autoCheck)
        writeUpdateChannel(replayed.state.updateChannel)
        writeOverrides(replayed.state.overrides)
        writeShikiStyle(replayed.state.shikiStyle)
        emitPrefs()
        reapplyThemePrefs()
        applyDesired()
        syncedSection = settingsSectionFromState(replayed.state)
        queuePersist()      // persistLocal 从 localStorage 重建 ⇒ 正好是 merged
        return
      }
      // 没有任何真实改动 ⇒ 落到普通采纳路径（空 origin 的 boot publish 即此类）
    }
    …既有分支不变…
  }
```

采纳分支尾部（`applyDesired()` 之后）补一行 `syncedSection = settingsSectionFromState(state)`；
`persistLocal` 的 `outcome === 'written'` 分支里 `syncedSection = lastWrittenSection`。

三个语义点：

- **`changed === false` ⇒ 完全回落到既有采纳逻辑**，等于"这次 boot publish 没发生"。这是修复的主路径。
- **`changed === true` ⇒ 用户的 boot 窗口改动赢**，但只赢自己动过的字段（报告人验证用例 3：
  窗口内切 mocha，玻璃与文档其余字段原样保留）。
- 回放走 `queuePersist()` 而不是直接 `scope.write()`：`persistLocal` 从 localStorage 重建状态，
  而我们刚刚把 merged 写进了缓存，所以写出去的就是 merged —— 不需要给 `persistStateToScope`
  开新入口。

### 4.2 P2：只在**真有增量**时才 arm

```ts
  const queuePersist = (): void => {
    // issue #30：boot 期的 glass publish / theme adopt 也会走到这里，此时
    // "本地状态"就是出厂默认。只有相对同步点真的动过才值得 arm。
    if (!isScopeUsable(scope.getSnapshot())
      && !settingsSectionsEqual(settingsSectionFromState(buildLocalState()), syncedSection)) {
      pendingLocalPush = true
    }
    …
  }
```

只在不 usable 分支里算增量 ⇒ 热路径（滑杆拖动）零额外成本。

### 4.3 P3（可选，建议单独提交）：glass 订阅只认"持久化字段真的变了"

```ts
  const offGlass = glass.subscribe(() => {
    if (settingsSectionsEqual(settingsSectionFromState(buildLocalState()), syncedSection)) return
    queuePersist()
  })
```

`GlassLayer` 的 `snapshot` 含派生字段（`dark`），`theme/change` 上无条件 publish —— 那些 publish
不携带任何持久化变化。收窄后：① 每次 boot 少一次无谓的 flush；② 去掉它可能撞上
"文档已移动 ⇒ `stale` ⇒ 弹出'另一窗口已更新'横幅"的假阳性通道。

### 4.4 报告人补丁的复核结论（2026-10-27 二次复核：**推翻本节初稿**）

**初稿说"补丁有两处必须修"，这个判断是错的。** 复核方法是把报告人的 diff 重建成可运行的变体
（`webServer` 未涉及，只改 `src/client/index.ts`；`sameOverrides` / `sanitizeState` 按 bundle 现实补导入），
跑本仓库两个测试文件：

| 变体 | `tests/reentrancy.spec.ts` | `tests/state.spec.ts` | 备注 |
|---|---|---|---|
| 报告人补丁（重建） | **16/16 pass** | 28/28 pass | 含本次新增的 issue #30 回归：**0 次写入**、localStorage 采纳到 `catppuccin-frappe` |

| 初稿的指控 | 复核结论 | 依据 |
|---|---|---|
| "补丁让 `pendingLocalPush` 分支落到 `!hasUserLayer`，merged 丢失、回放失效" | **不成立** | `!hasUserLayer` 意味着文档**还没有 user layer**，那里本来就该"localStorage 会话整段胜出并推上去"（0.5 起的迁移路径）。推 `local` 与推 `merged` 在被覆盖的内容上没有差别（没有 user layer 可被覆盖），且这正是 0.6.4 的既有语义。 |
| "`bootLocalSection` 只在回放分支刷新，scope 反复 unavailable→ready 时基线陈旧" | **不成立（我读错了缩进）** | 那两行在 `applyScopeSnapshot` 的**函数尾**，等价于"每次采纳后刷新基线"，初稿担心的路径不存在。 |

真正的差异只剩两条**更窄的窗口**，属"我的实现更保守"，不是缺陷：

1. **arming 无条件** ⇒ 每次 boot publish 都会跑一遍"回放 + 采纳"（无害），同时保留一次 300 ms 的 flush。
   若这 300 ms 内另一个窗口改了文档，而 read-side guard 因 boot 时 `baseRevision` 未捕获而跳过，
   那次 flush 仍可能用旧值覆盖 —— 与 #30 同类，但窗口从"整段 boot"缩到"一次 debounce"。
   本仓库实现用 P2（只在有真增量时 arm）+ P3（glass 订阅只在持久化字段变化时排写入）把这次写完全去掉。
2. **基线不在写盘后刷新** ⇒ 若 scope 之后重新不可用、用户再改一项，delta 会把"上次已写盘的字段"一起重推。
   同值幂等，只有当另一窗口在这期间改过那些字段时才不同。

**方法学教训（写进流程）**：拿 diff 摘录判断分支位置，两次都错在"上下文缺失 + 缩进被 Markdown 吃掉"。
以后评审他人补丁，**先重建可运行变体跑测试，再下结论**；读 diff 只用来定位。
⚠️ 重建时要留意：他的 `lib/client.js` 是单文件 bundle，`sameOverrides` / `sanitizeState` 在同文件内本来可见，
搬到源码树必须补 import —— 我第一次重建就漏了 `sanitizeState`，导致回放块抛异常被吞、测试出现**假红**
（写入值是默认值，看起来像补丁失效）。**假红/假绿都要靠"异常是否被吞"这一步排掉。**


## 5. 备选方案（记录未采纳理由）

| 方案 | 做法 | 结论 |
|---|---|---|
| 脏字段集合 | 每个 mutator（`writeFlavor`、glass 各 setter）登记"本会话显式改过哪个字段"，回顾时按集合取 local 值 | **更准确**（能表达"显式设成默认值"），但要把 plumb 穿到 glass 全族 + 设置行 + 存储事件，漏掉任一路径就是静默丢改动（issue #26 的教训）。当前不做，留作 §6 空洞扩大时的升级路径 |
| 干脆去掉 `pendingLocalPush` | 一律文档优先 | 会复活 R2：boot 窗口内的真实改动被首个快照回滚（2026-10-10 review 修的就是它） |
| 只在 `persistLocal` 里拦 | flush 时若"尚未与文档对账过"就跳过写 | 会把 boot 窗口的改动一起丢掉；且丢的是用户动作而非默认值 |

## 6. 残留空洞（接受，需写进 CHANGELOG/注释）

增量回放无法区分"没动过"与"显式设成了默认值"。⇒ **在 boot 窗口内把某字段显式改成它当前的默认值**
（例如空 origin 上点"关闭风味"，而 baseline 里 flavor 本来就是 `off`），该动作会被文档覆盖回去。
窗口是亚秒级、方向是"文档优先"（不丢持久数据，用户重点一次即可），接受。

## 7. 测试与变异

`tests/state.spec.ts` 新增 `describe('replayLocalChanges (issue #30)')`：

1. 未变化 ⇒ `changed === false`，且 `state` 与 `doc` 逐字段相等（空 origin 主路径）。
2. 只动 `flavor` ⇒ 文档的 glass 原样保留。
3. 只动 glass 旋钮 ⇒ 文档的 flavor 原样保留。
4. `overrides` 整张接管（含"本地空图、文档非空"方向）。
5. 全字段同时动 ⇒ 全部生效。
6. **字段漂移护栏**：一张 `field → 变异器` 表，断言表覆盖
   `['flavor', ...Object.keys(defaultSettingsSection().glass).map(k => 'glass.' + k), 'autoCheck', 'updateChannel', 'overrides', 'shikiStyle']`；
   新增持久化字段而没登记变异器 ⇒ 用例红。
7. 变异检查：把 §4.1 的 `changed === false` 回落删掉（改回无条件回放）⇒ 用例 1 必红；
   把某字段从 `replayLocalChanges` 删掉 ⇒ 用例 6 必红。

**测不到的部分要说清楚**：`pendingLocalPush` 的 arm/回放都在 `src/client/index.ts` 的 effect 闭包里，
本仓库没有 effect 级 harness（`tests/client.spec.ts` 只测纯函数），所以这段只能靠真机验收。

## 8. 发版与文档

- 版本：**`0.6.5`**（bug 修复，patch；不进 `beta`，直接 `latest`）。
- `CHANGELOG.md`：新增 `[0.6.5]` 段，写明"文档就绪前排队的持久化不再整段回写出厂默认"、
  触发面（随机端口 / webview / 清数据）、以及 §6 的残留空洞。
- README FAQ 那条承诺**不用改**——修完才真的成立。可考虑加半句"boot 亚秒窗口内把某项改回默认值
  时该次改动让位文档"，非必须。
- `AGENTS.md`：本轮无新惯例；§2 的环境校正一句即可（rc.3 已在 `dshReleases`）。

## 9. 真机验收（本机）

1. 备份 `~/.dsh/profiles/desktop/cordis.patch.yml`。
2. 起壳：`env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS -u WORKBUDDY_CLIENT_USER_AGENT
   "./DeepSeek Harness.exe" --remote-debugging-port=9333`（连 localhost 需 `NO_PROXY`）。
3. **同步 profile**（本机是实体副本，`pnpm build` 不自动生效）：
   `pnpm build && cp -r package.json cordis.patch.yml icon.png README.md LICENSE lib themes ~/.dsh/profiles/desktop/node_modules/@nonamelego/dsh-catppuccin/`
4. 复现：CDP `eval` 里 `localStorage.clear()` → `Emulation.setCPUThrottlingRate {rate: 8}` → `location.reload()`
   → 等 6s → 看 `cordis.patch.yml` 是否仍是 frappe / `enabled: true` / `compat`（应为是）。
5. 反向确认补丁有效：同步骤在 0.6.4 的 `lib/client.js` 上应能命中（至少一次）。
6. 收工**改回 `cordis.patch.yml` 原值**（用户偏好在里面）。

## 10. 待维护者裁定

1. P1 + P2 一起进 `0.6.5`；P3 单独提交（可随时回滚）——是否同意这个切法？
2. §6 的残留空洞按"接受 + 记录"处理，还是现在就要上 §5 的脏字段集合？
3. 是否邀请报告人按 §4.1 的形态提 PR（他提过愿意），或由本仓库实现后请他复验。
