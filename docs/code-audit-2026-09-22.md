# 代码审计 —— 2026-09-22（0.5.5 之后）

> 范围：全量通读 `src/`（18 个 ts/tsx + 2 个 css）、`scripts/`（4 mjs / 3 cjs / 1 py）、
> `tests/`、`package.json` / `tsdown.*` / `cordis.patch.yml`；重跑三个生成器核对产物；
> 对可疑点写**临时复现用例**（跑完即删，未入库）取硬证据。
> 结论：**4 个真 bug（2 个是"承诺未生效"型假账）+ 5 个次要问题**；架构、错误处理纪律与
> 生成物一致性经查良好。修复建议见文末「六」。
>
> **✅ 同日已全部修复**（F1~F9），记录见文末「七」：新增/改写 **15 条断言**（173 用例全绿），
> 其中 F1/F2/F3/F5/F6 用**变异测试**逐个验证过"改回旧写法即变红"。

---

## 一、结论摘要

| # | 位置 | 问题 | 级别 | 证据 |
|---|---|---|---|---|
| **F1** | `glass-layer.ts:221` | 跨窗口改**模糊/磨砂/亮度**旋钮，本窗口**永远不同步**（`in` 判的是对象键名而非 localStorage 键） | **P1** | 复现用例红：`expected 2 to be 24` |
| **F2** | `client/index.ts:436` + `state-sync.ts:134` | 「读侧陈旧写保护」**恒不成立** ⇒ 多窗口下后写者静默覆盖对手，`另一窗口已更新` 横幅永不出现（台账 `C`/`X` 的 ✅ 至少一半是假账） | **P1** | 复现用例红：`expected 'written' to be 'stale'`；两次 `getSnapshot()` 同 tick |
| **F3** | `glass-row.tsx:143` | 旋钮处于「自定义档位」时，**预设组没有任何可 Tab 到的格子**（三格全 `tabIndex=-1`）——键盘用户进不去 | **P2** | 复现用例红：`expected +0 to be 1` |
| **F4** | `client/index.ts:538-549` / `:525` | **跨窗口「关闭风味」不落地**：storage 处理器忽略 `off`；且 `applyDesired` 读到 `off` 直接 return，从不恢复 built-in 偏好 ⇒ 另一窗口仍显示 Catppuccin，直到刷新 | **P2** | 代码路径（本轮未写复现） |
| **F5** | `CatppuccinRow.tsx:378` | 草稿行用数组下标当 React key，且输入框非受控 ⇒ 删掉中间一行后，**DOM 里残留的文本会错配到下一行**（显示与状态不一致） | **P3** | 代码路径 + React 非受控语义 |
| **F6** | `UpdateRow.tsx:184-212` | 失败后的 30 s 自动重试用**调度时刻闭包里的 `channelValue`** ⇒ 期间切了通道，重试仍查旧通道 | **P3** | 代码路径 |
| **F7** | `settings-catppuccin.ts:52` | `overrides` 只校验「字符串字典」，不校验键是否 `--`；客户端读时丢弃、又**不写回** ⇒ 文档里的垃圾键永远清不掉，每次快照变化都白跑一轮「文档胜出」 | **P3** | 代码路径 |
| **F8** | 仓库根 | 残留 `.client-043.tmp.ts`（旧版 `client/index.ts` 的临时副本，被 `.gitignore` 覆盖所以不会提交，但会污染 grep / 搜索） | **P3** | 文件存在 |
| **F9** | `scripts/gen-glass-css.mjs:30-37` | 缺 `lightningcss` 时**静默降级**为未压缩原文 ⇒ 产物随环境变化（今天只差体积，将来若加前缀/降级语法会静默失真） | **P3** | 代码路径 |

---

## 二、P1 缺陷详情

### F1 跨窗口旋钮不同步（`glass-layer.ts:216-226`）

```ts
// NUMERIC_KEYS 的**键**是 'blur' | 'frost' | 'brightness'，**值**才是 localStorage 键
const NUMERIC_KEYS = { blur: 'dsh.catppuccin.glass.blur', frost: ..., brightness: ... }
...
} else if (event.key === MODE_KEY || event.key in NUMERIC_KEYS) {   // ← 恒 false
```

`event.key` 的值形如 `dsh.catppuccin.glass.blur`，而 `in` 查的是**属性名**（`blur` / `frost` / `brightness`），
所以这一支**永远不成立**。表现：A 窗口拖动模糊滑块 → B 窗口的玻璃不重绘、设置行快照也不刷新
（`publish()` 没被调用）。`MODE_KEY` 用的是 `===` 比较，所以**模式**能同步——这也是它一直没被发现的原因
（跨窗口试验时通常先动模式）。

**修法**：`Object.values(NUMERIC_KEYS).includes(event.key)`（或把 `NUMERIC_KEYS` 反转成 `storageKey → knob` 表）。
**回归测试**：jsdom 里 `new GlassLayer(fakeCtx)` 后派发 `StorageEvent`，断言 `getSnapshot().blur` 跟随。

### F2 陈旧写保护恒不成立（`client/index.ts:432-445`）

文档（`state-sync.ts:91-112`）承诺的语义是：

> `baseRevision` **captured at schedule time** … 与 flush 时的 revision 比较；不等 → 判定陈旧、放弃写入。

但真实调用点是：

```ts
const persistLocal = (): void => {            // 这是 **flush 时** 才跑的函数
  const snapshot = scope.getSnapshot()
  const state = buildLocalState()
  const baseRevision = snapshot.revision      // ← 在这里才取，不是 schedule 时
  void persistStateToScope(scope, state, { baseRevision, lastWrittenSection })...
}
```

`persistStateToScope` 内部再 `scope.getSnapshot()` 一次——**两次读取在同一个同步块里**
（复现用例里的仪器化 scope 实测：调用后 `getSnapshot` 计数 = 2，且此刻尚未 await）。
中间没有任何 await，JS 单线程下 revision 不可能变 ⇒ `snapshot.revision !== baseRevision` **恒为 false**，
`'stale'` 分支与「自己的回声」判定都成了死代码。

**后果**：另一窗口在 300 ms 防抖窗口内提交了新选择时，本窗口的 flush **照写不误**——
即 `C`/`X` 声称修掉的「最后一个写覆盖前一个」在多窗口下依然存在，而且**冲突横幅不会出现**
（`emitConflict()` 只挂在 `outcome === 'stale'` 上）。
`scope.mutate` 的服务端 fencing 只能挡住「基于旧 revision 的 mutate」，挡不住「读到旧值后重新组装的整份状态写入」。

**修法**（一处改动）：把「基版本」提到调度时捕获，并按 burst 语义保留首个：

```ts
let baseRevision: number | undefined
const schedulePersist = (): void => {
  baseRevision ??= scope.getSnapshot().revision   // 一个 burst 只固一次
  scheduleDurablePersist(persistLocal)
}
const persistLocal = (): void => {
  const snapshot = scope.getSnapshot()
  const base = baseRevision
  baseRevision = undefined                        // 本次用掉就作废
  ...
  persistStateToScope(scope, state, { baseRevision: base, lastWrittenSection })
}
```

（`??=` 是关键：拖滑块会连续 emit 多次，base 必须固定为「本地状态所基于的那一版」，而不是每次刷新成当前版。）

---

## 三、P2 缺陷详情

### F3 预设组在自定义档位下不可键盘到达（`glass-row.tsx:92-106,143`）

`Segmented` 的 roving tabindex 是 `option.id === (focused ?? value) ? 0 : -1`。
预设组传的 `value` 是 `activePreset ?? ''`——**旋钮不等于任何预设时是空串**，于是三格全是 `-1`：
组里的按钮拿不到焦点，键盘用户无法应用预设（`AA` 承诺的 roving tabindex 只对「模式」那组真正成立）。

**修法**：无匹配时让第一格 tabbable（`const anchor = options.some(o => o.id === value) ? value : options[0]?.id`），
或记住上次选中的预设 id。回归测试：`getState` 返回不匹配任何预设的旋钮组合，断言组内有且仅有 1 格 `tabIndex === 0`。

### F4 跨窗口「关闭风味」不落地

两条路径都漏了 `off`：

- `client/index.ts:538-549` 的 `onStorage`：`if (next !== 'off') { … setTheme(next) }`——`off` 时**什么都不做**；
- `client/index.ts:525` 的 `applyDesired`：`const desired = readFlavor(); if (desired === 'off') return`——
  即便是从设置文档（另一个窗口写的）水合过来，也**不会把运行时切回 built-in 偏好**。

所以：窗口 A 选「跟随系统」→ 文档与 localStorage 都是 `off` → 窗口 B 仍显示 Catppuccin，且它的
Catppuccin 行会把 Mocha 高亮（`current()` 读的是运行时 preference），直到刷新才一致。
单窗口路径没问题——`injected().select('off')` 显式调用了 `theme.setTheme(readRestoredPreference())`。

**修法**：storage 处理器补 `else { theme.setTheme(readRestoredPreference()) }`，或在 `applyScopeSnapshot`
发现 `state.flavor === 'off'` 且运行时仍是非内建值时走同一句。

---

## 四、P3 细节（逐条一行）

- **F5** `draftRows.map((row, index) => <div key={\`draft-${index}\`}>`：非受控 `defaultValue` + 下标 key，
  删除中间草稿行时 React 复用 DOM 节点，文本与状态错位。修法：给草稿行稳定 id（`useRef` 计数或 `crypto.randomUUID()`）。
- **F6** `runCheck` 闭包里的 `channelValue` 只在渲染时求值；重试应改读 `channel()`（注入函数本身就是实时读）。
- **F7** 文档里非 `--` 的 override 键：`Schema.dict` 不校验键名，客户端 `sanitizeOverrides` 丢弃后又不写回，
  于是每次 `settingsSectionsEqual` 都判「不相等」→ 每轮快照变化都执行一次 adopt（无害但白跑）。修法：
  schema 加键名约束，或 adopt 时把规范化结果回写一次。
- **F8** 删掉仓库根的 `.client-043.tmp.ts`（本轮审计时它污染了 `grep persistStateToScope` 的结果）。
- **F9** `gen-glass-css.mjs` 缺依赖时静默降级：至少 `console.warn` 一行，或直接 `throw`（build/prepare 路径上缺依赖本来就该失败）。

---

## 五、查过并确认健康的部分

| 项 | 结论（可复核） |
|---|---|
| **生成物一致性** | 重跑 `gen-glass-css.mjs` / `generate-palettes.mjs` / `generate-tui-themes.mjs`：`git status` **全部无输出** ⇒ `palettes.ts`（4 风味）、`themes/*.json`（4 × 95 键）、`glass-css.gen.ts`（13554 B）与提交内容**逐字节一致**，无漂移 |
| **配色纪律** | `glass.module.css` 里除亮度混色用的 `#ffffff` / `#000000` 外**无硬编码色相**；全部规则用属性选择器（`[data-dsh-glass…]`），所以「原文注入 <style>」不依赖 CSS Modules 哈希——`glass.module.css` 从不被 import 是有意设计（`gen-glass-css.mjs` 注释已说明） |
| **容错纪律** | 全部 `localStorage` 访问都在 `try/catch` 内（27 处）；`JSON.parse` 三处全在 `try` 内；三个生成器不会在缺缓存时静默产出空表 |
| **状态 sanitize** | 读/写两侧同形状：`sanitizeState`（Host 读+写）×`sanitizeOverrides`（客户端读）×schemastery（文档侧），数值 clamp、枚举回退、未知键丢弃都测过 |
| **构建期守卫** | tsdown 的 client 纯净门（跨插件 value import 直接报错）、CSS Modules 内联、`CLIENT_EXTERNALS` 与平台种子表一致；`cordis.patch.yml` 两行 id 与 `name`/`tui-themes` 对齐 |
| **测试与 CI** | 本地 `tsc` ×2 零错、vitest **158 用例全过**；CI `check` + `boot-e2e` 双 job；`boot-e2e` 已用变异测试证明会红 |
| **防呆机制** | 三类「假账」防线都在：palette 契约 pin（`palettes.spec.ts:105`）、死键守卫（`locales.spec.ts`）、CSS 不变量（`glass-css.spec.ts`）。→ **本轮的 F1/F2 说明还缺一类：断言「开关/事件真的接上了」的接线测试** |

---

## 六、修复建议（按性价比排序）

1. **F1（1 行）+ F3（1 行）+ F6（1 行）**：三处都是一行级改动，各配一条回归测试（jsdom 即可，不需要真起宿主）。
2. **F2（1 处重构 + 1 条断言）**：改动虽小但语义关键，建议连带把台账 `C` / `X` 的状态改成
   「⚠️ 写侧 fencing 生效；**读侧保护 2026-09-22 审计证伪（F2）**」——正是本仓库自己定的规矩：状态列必须写可复核证据。
3. **F4**：取决于你是否真会开两个窗口改设置；修法一句话，建议顺手补上。
4. **F5 / F7 / F8 / F9**：低优先，可与其他改动合并，或先记入台账「待评估」。

---

## 七、修复记录（2026-09-22 同日）

| # | 修法 | 位置 | 回归测试 | 变异验证 |
|---|---|---|---|---|
| **F1** | 新增 `NUMERIC_STORAGE_KEYS = Object.values(NUMERIC_KEYS)`，`storage` 处理器改用它 `includes(event.key)` | `glass-layer.ts` | 新增 `tests/glass-layer.spec.ts`（5 例：三个旋钮各走一遍 + 模式/开关分支 + `key: null` 全量重载 + 无关键不重发） | ✅ 修复前该断言实测红（`expected 2 to be 24`） |
| **F2** | `state-sync.ts` 新增 `createBaseRevisionTracker()`（`capture` 取 burst 首版、`take` 读后即清）；`index.ts` 把 8 处 `scheduleDurablePersist(persistLocal)` 收拢为 `queuePersist()`，**调度时**捕获 base、flush 时消费 | `state-sync.ts`、`client/index.ts` | `tests/client.spec.ts` 3 例：burst 只固首版、scope 未就绪时不留残值、**「防抖窗口内被外部改动」→ `'stale'` 且零写入**（并附反事实：flush 时取 base 会写成 `'written'`） | ✅ 修复前 `'written'`（复现用例）；反事实断言常驻测试 |
| **F3** | `Segmented` 增加 `matchesValue`/`anchor` 计算：无匹配时锚到第一格，保证组内恒有 1 个 tab stop | `glass-row.tsx` | `tests/rows.spec.tsx` 2 例（自定义档位 / 命中预设） | ✅ 变异回旧写法 → `expected [] to have a length of 1 but got +0` |
| **F4** | 新增导出 `readExplicitFlavorOff()`（区分「没存过」与「显式 off」）；`applyDesired` 在 `off` 分支经 `scheduleRestore(readRestoredPreference())` 回退（复用 issue #10 的微任务延迟），`onStorage` 补 `off` 分支 | `client/index.ts` | `tests/client.spec.ts` 1 例（谓词三态）；**接线本身仍靠阅读**（需要完整 `apply()` 语境，见下） | — |
| **F5** | 草稿行加稳定 `id`（`useRef` 计数器）并用作 React key | `CatppuccinRow.tsx` | `tests/rows.spec.tsx` 1 例：两行草稿、删首行、断言存活行的输入框文本 | ✅ 变异回下标 key → `expected '--dsw-static-blue-500' to be '--dsw-static-green-500'` |
| **F6** | `runCheck` 的通道默认值改为调用期解析（`withChannel ?? channel()`） | `UpdateRow.tsx` | `tests/rows.spec.tsx` 1 例：失败后切通道、推进 30 s，断言重试用新通道 | ✅ 变异回 `channelValue` → `expected ['latest','latest'] to deeply equal ['latest','beta']` |
| **F7** | `state.ts` 新增 `hasUnpersistableOverrides()`；`applyScopeSnapshot` 在采用前若发现文档含不可持久化 override，`queuePersist()` 回写一次使其收敛 | `state.ts`、`client/index.ts` | `tests/state.spec.ts` 2 例（含「与 `sanitizeOverrides` 一致」的互证） | — |
| **F8** | 删除仓库根残留的 `.client-043.tmp.ts` | 仓库根 | —（文件已不在） | — |
| **F9** | 缺 `lightningcss` 的降级路径从静默改为 `console.warn` 并说明后果 | `scripts/gen-glass-css.mjs` | — | — |

验证：`tsc -p tsconfig.json` / `-p tsconfig.vitest.json` **各 0 错**；vitest **15 文件 / 173 用例全过**（修复前 158）。

**仍未覆盖的一处（诚实标注）**：F4 的两条接线分支（`applyDesired` 的 off-回退、`onStorage` 的 off-分支）**没有自动化测试**——
它们需要构造完整的 `apply()` 语境（slots / locale / theme / settingsScope 四个假服务），成本高于收益；
目前只有 `readExplicitFlavorOff()` 这一纯函数被测试锁住。将来若要做宿主级验证，`scripts/e2e-boot-check.cjs` 是更合适的挂点。

**CHANGELOG**：本轮修复详见 `CHANGELOG.md` 的 `## [Unreleased]`；四个风味预览图未受影响（无视觉改动），无需重出。

---

**共性教训（值得写进 AGENTS.md「本机测量资产」旁边的惯例区）**：
「功能已实现」不等于「接线正确」。本轮 F1（把对象键名当 localStorage 键）与 F2（两次同步读被打扮成版本比对）
都是**只看代码逻辑、不跑真实事件**时读不出来的类型，而它们恰好都落在**测试没覆盖的接缝**上：
storage 事件的旋钮分支、以及「外部编辑发生在防抖窗口内」这条时序假设。修完建议补两类测试：
① **接线测试**（每个 `if`/`switch` 分支至少被一个事件穿过）；② **时序测试**（用可注入的时钟/revision 模拟"窗口外先动"）。
