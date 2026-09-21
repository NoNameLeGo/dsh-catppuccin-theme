# dsh-catppuccin 插件改进建议

> 记录日期：2026-09-05（2026-09-06 修正：按仓库当前实现复核，下文「现状修正」为与实际代码的差异）
> **核心目标（本档各条取舍的准绳）**：按 Catppuccin 官方源配色（`catppuccin-palette.json` v1.8.0）把 DSH 的 `--dsw-*` token 体系完整适配成四个风味；**玻璃质感是附带目标**（只改材质，不改配色）。准绳**不是教条**：官方取值在 DSH 的实际用法下确实不成立时（有证据、已穷尽不换色相手段）允许有据偏离。完整规则（四条硬规则）与判定先例见 `AGENTS.md`「项目定位与核心目标」。
> 2026-09-06 第二批：非视觉改进项已按 `docs/non-vision-start-prompt.md` 实施（C/X/N/A/K/R/S/T/Y/EE/L/II/KK/H/I/J/E/DD/M/U/V/W/CC/GG/HH/JJ），跟踪表见文末。
> 2026-09-13 复核（0.5.1 之后，配合 `fix(client)` 提交 cdccb09）：新增 **TT**（覆盖编辑器值输入逐键提交）、**UU**（测试类型检查链路断链）两条**待评估**项，分析见 3.2 / 3.9 —— 当时决定不随该修复批次实施，留待下次评估。
> 评估范围：`@nonamelego/dsh-catppuccin` 插件本身（host half + client half + tui-themes half）
> 版本基线：`0.5.0-beta.0`（0.5.0 重构已实施并存在于树中、尚未发版；本档按仓库**当前实现**评估，而非已发版的 0.4.3）
> 评估依据：`src/index.ts`、`src/client/index.ts`、`src/client/CatppuccinRow.tsx`、`src/client/UpdateRow.tsx`、`src/client/glass/`、`src/client/palettes.ts`、`src/tui-themes.ts`、`src/update-check.ts`、`src/state.ts`、`src/client/state-sync.ts`、`src/legacy-state.ts`、`src/settings-catppuccin.ts`、`src/client/locales.ts`、`cordis.patch.yml`、`package.json` 等的当前实现

---

## 一、总体评估

插件整体结构清晰、双 store 持久化（localStorage + Host 文件）解决 DSH Desktop 端口漂移问题的设计值得称道，TUI 同步 half 与主 half 解耦也避免了 webServer 注入阻塞。但仍有以下系统性问题：

| 维度 | 评分 | 主要问题 |
|---|---|---|
| 架构清晰度 | 8/10 | 单 host half 同时承担 settings namespace 注册 + update-check 路由两类职责，关注点略杂 |
| 插件 UX | 6.5/10 | 三个 settings row 缺统一头部/分组；GlassRow 缺预览；UpdateRow 缺自动检查开关 |
| 主题覆盖度 | 7/10 | 4 个风味完整，但缺用户覆盖单 token 的能力 |
| Glass 皮肤质量 | 7.5/10 | MutationObserver seam stamper 性能未保护；prefers-reduced-motion 已覆盖 |
| TUI 同步 | 8/10 | 幂等且 best-effort，但用户自定义文件可能被覆盖 |
| 更新检查 | 7/10 | 5min 缓存 + 同源路由 OK，缺离线探测与重试退避 |
| 状态持久化 | 8/10 | 0.5.0 已迁移到官方 settings seam（revision-fenced 原子写），legacy 文件仅作一次性迁移源；剩余问题：多 tab 下 localStorage 与 settings document 的读取一致性 |
| 可访问性 | 5.5/10 | aria-pressed 有，slider 缺 aria-valuetext；Glass 模式对低对比度用户不友好 |
| 国际化 | 6/10 | 仅 zh/en；风味名未本地化 |
| 测试覆盖 | 7.5/10 | 单测完整，缺 e2e 与视觉回归 |
| 文档/DX | 7/10 | AGENTS.md 出色，缺新增风味的贡献流程 |
| 性能/体积 | 6.5/10 | CSS module 副作用 import 即时挂载；主题注册全量启动 |

---

## 二、做得好的地方（保留）

- **端口漂移解决**：0.5.0 把持久化迁移到官方 settings seam（Host `ctx.settings` / Client `ctx.settingsScope`），天然端口无关；legacy `$DSH_HOME/catppuccin-state.json` 降级为一次性迁移源（`src/legacy-state.ts`），localStorage 保留为浏览器内缓存与跨 tab 同步总线
- **TUI half 解耦**：tui-themes 子路径无 inject，能在 web/desktop/tui 任一 profile 激活
- **幂等同步**：`syncTuiThemes` 只覆盖 `catppuccin-*.json` 命名空间，对用户文件零侵入
- **错误码演进**：`UpdateErrorCode` 已是 6 值枚举（`ok` / `network` / `registry-unreachable` / `registry-http` / `no-dist-tags` / `invalid-response`），`fetchLatestVersion` 按 fetch 失败 / HTTP 非 2xx / 解析失败分别返回不同 code
- **错误码枚举**：`UpdateErrorCode` 稳定机器可读，Client 不用嗅探人话
- **Channel 智能选择**：`selectNewest` 在 stable 上不追 beta，避免降级
- **AGENTS.md**：发布 SOP + 名字陷阱表堪称教科书级
- **AUTO-GENERATED 标注**：`palettes.ts` 顶部明确标"do not edit by hand"，避免误改

---

## 三、问题清单与改进建议

### 3.1 架构与代码组织

**A. Host half 职责过载** — 优先级 **P2**（前提已变，需重新定位）
- **现状修正**：0.5.0 起 `/catppuccin/state` 路由已被官方 settings seam 取消（见 `src/index.ts` 与 `src/legacy-state.ts` 头部说明），`src/index.ts` 现在只挂载 `/catppuccin/check-update` 一条路由 + 注册 `catppuccin` settings namespace；文件 266 行，update-check 逻辑（`fetchLatestVersion`、`handleUpdateCheck`、缓存）仍全部内联。
- 优化方向：把 update-check 路由从 `src/index.ts` 拆到独立模块（如 `src/update-check/host.ts`），`index.ts` 只剩 settings namespace 注册 + 一行 `ctx.effect` 调用；`cordis.patch.yml` 可增加 `id: dsh-catppuccin-update` 的独立 entry。
- 实施方法：cordis 允许多 entry；拆分后 `update-cache` 缓存状态随模块走。
- 预期效果：`src/index.ts` ≤120 行；update-check 模块可独立测试；未来加 `/catppuccin/health` 等路由有家可归。

**B. `palettes.ts` 单文件过大** — 优先级 **P2**（❌ **已驳回，2026-09-15 复核**）
- **复核结论（2026-09-15）**：实测 714 行、纯生成物、单一入口消费。拆文件对 bundle 体积零影响（同一次构建出来的同一份数据），对可维护性没有实测痛点。判为 **YAGNI**——等出现「改一处得在 700 行里滚半天」的具体案例再拆。
- 现象：自动生成的 `palettes.ts` 包含 4 个风味的完整 `--dsw-*` token 表，实际 **714 行**（非原估的 2000+ 行），仍是仓库里最大的单文件，但绝对体积可控。
- 优化方向：按风味拆为 `palettes/latte.ts`、`palettes/frappe.ts` 等，`palettes/index.ts` 汇总 `CATPPUCCIN_FLAVORS`。
- 实施方法：改 `scripts/generate-palettes.mjs` 输出目录结构；`tsdown` 自动 inline 多 entry。
- 预期效果：阅读/调试时可只看相关风味；treeshaking 友好（虽然会被注册全用，但开发期 IDE 跳转友好）。

**C. 持久化并发保护** — 优先级 **P1**（**前提已变：写侧大部分已被 0.5.0 重构覆盖**）
- **现状修正**：仓库里**没有** `src/host-state.ts`。0.5.0 起持久化已从「直读直写 JSON 文件」迁移到官方 settings seam：Client 侧 `src/client/state-sync.ts` 的 `persistStateToScope` 通过 `scope.mutate(...)` 做 **revision-fenced 原子写**（一次 `set` 全部 6 个 path），Host 侧 `src/index.ts` 通过 `ctx.settings.installSection` 注册 `catppuccin` namespace；legacy `$DSH_HOME/catppuccin-state.json` 已降级为只读一次性迁移源（`src/legacy-state.ts`）。`scheduleDurablePersist`（Client 侧 300ms 防抖）依然存在且有效，不需要再为 JSON 文件实现 `atomicWriteFile`。
- 残留问题：revision fencing 只覆盖「写」冲突；多 tab 下 **localStorage（浏览器内缓存/跨 tab 总线）与 settings document 之间的读取一致性**未定义——典型场景：tab A 从 localStorage 读到旧值后写回，可能覆盖 tab B 已通过 settings 提交的新值。
- 优化方向：写回前比对 scope snapshot 的 revision / `updatedAt`，早于远端则放弃本地写；UI 给 toast「另一窗口已更新，本地改动未保存」。与 X 是同一问题的两面，合并实施。
- 实施方法：在 `persistStateToScope` 前加 revision 检查；`CatppuccinSettingsSection` 增加 `updatedAt`（需上游 settings schema 支持）。
- 预期效果：杜绝半截 JSON 导致状态损坏（已由 seam 保证）；多 tab 行为可预测。

---

### 3.2 插件 UX（用户实际看到的 settings row）

**D. 三个 row 缺分组头部** — 优先级 **P1**（▲ **仅剩「向上游提 issue」一个动作**）
- **复核结论（2026-09-15）**：本地无动作可做（按 2026-09-06 现状修正：slot 类型只有 `id` / `order`）。唯一可执行项 = 向 `@deepseek-ai/dsh-web-ui` 提 `settings.general.group` 或 row 级 `label` 请求，提出后把链接挂到跟踪表本行即可，不占实施排期。**在此之前不自己造分组。**
- 现象：`CatppuccinRow` + `GlassRow` + `UpdateRow` 全部注册到 `settings.general.item`，平铺在 General 段，没有"主题与外观"的二级标题。
- **现状修正（2026-09-06）**：核查 `dsh-client-ui-settings`（0.1.2-rc.1）的 slot 类型（`client/contract/slots.d.ts`），`settings.general.item` 只有 `id` / `order`，**没有 group / label / section 支持**——"The section column only stacks rows, so a row draws its own internals"（row 完全自绘）。实施说明：**不自己造分组**，向 `@deepseek-ai/dsh-web-ui` 上游发起 `settings.general.group` 或 row 级 `label`/分组 prop 的请求；上游落地后再注册。
- 预期效果：用户在 General 一长串偏好中一眼看到主题相关项。

**E. `CatppuccinRow` 5 个按钮在窄屏溢出** — 优先级 **P1**（✅ **已满足，本条可关闭**）
- 现象：4 个风味 + 1 个"跟随系统"按钮 + 各自 12px 色板 = 横向 ≈ 360px。DSH Desktop 在 1024px 宽时 settings drawer 可能挤压。
- **现状修正（2026-09-06）**：`CatppuccinRow.tsx` 的按钮容器已经是
  `display: flex; flexWrap: wrap`（最外层是纵向列，wrap 在按钮容器上），
  窄屏自动换行不溢出——本条无需再改。
- 预期效果：所有屏幕下都不溢出。

**F. 缺主题预览缩略图** — 优先级 **P2**
- 现象：点击风味按钮前，用户只能看到 12px 色板小方块，无法判断这个主题应用到整个 UI 长什么样。
- 优化方向：每个风味按钮下方加 32×18 的 mini 缩略图（用 inline SVG 画 4 个色块：base / mantle / text / accent）。
- 实施方法：在 `palettes.ts` 的 `CatppuccinFlavorInfo` 增加 `preview: { base, mantle, text, accent }`；按钮改两层布局。
- 预期效果：用户决策时间缩短、误选率下降。

**G. `GlassRow` 缺实时预览** — 优先级 **P1**
- 现象：拖动 blur / frost / brightness 滑块时，整个页面立即变化 → 副作用大；用户无法在不"先动手"的情况下比较 preset。
- 优化方向：在 row 底部加一块 240×60 的"玻璃样本"预览区，按当前 knobs 渲染一个小卡片，复用 `glass-layer.ts` 的样式 token。
- 实施方法：抽 `<GlassSwatch>` 组件，复用 `glass.module.css`，挂同样的 `data-dsh-glass` 属性。
- 预期效果：preset 选择无需"先看大效果再退回"。
- **复核结论（2026-09-21）：❌ 不推进（前提已被取代）**——0.5.1 的设置弹窗玻璃化之后，**这一行本来就坐在一个实时玻璃面板里**：`--dsh-glass-blur` / `--dsh-glass-frost` 挂在 `documentElement`（`glass-layer.ts:375-378`），拖 blur / frost 时弹窗自身跟着变，`[data-dsh-glass-settings]` 下的卡片与选择器也都是半透明的。再加一块 240×60 swatch 是重复能力；而 brightness（改的是页面地面）与 mode（改的是布局）本来就无法在一张 swatch 里表达。⇒ 与 `D`（插件适配 DSH，不改变 DSH）同一思路：不自己造一套预览。**重开条件**：若维护者或用户指出「设置弹窗里的实时玻璃预览哪里不够用」（例如想在不改动页面 / 不写设置的前提下比较两套参数），按那个具体场景重开。

**SS. `GlassRow` 缺预设档位** — 优先级 **P1**（✅ **已实施（ca979ba），本条可关闭**）
- **现状修正（2026-09-15）**：`src/client/glass/glass-row.tsx:152-159` 的 `GLASS_PRESETS` 已提供**清透 / 标准 / 磨砂**三档（id `clear` / `standard` / `frosted`），:241-247 渲染为单选，且「当前旋钮值恰好等于某档时该档高亮」（:178-179）；README「使用」已记载。**重做即白干。**（注：同日的审计块曾误把它列进视觉批次，已更正——见六、复核节。）
- 现象：blur / frost / brightness 三个滑杆全手动，新用户没有"什么叫好看"的参照，只能盲目试。
- 优化方向：row 内加三个预设按钮（清透 / 标准 / 浓雾），一键写入调校好的数值组合；滑杆仍可在此基础上微调。
- 实施方法：在 `glass-row.tsx` 定义 `GLASS_PRESETS: Record<string, GlassSettings>`；点击即走现有 setter + durable persist 链路。
- 预期效果：上手成本大降；与 G（预览 swatch）组合后 preset 可"先看再选"。

**H. `UpdateRow` 缺自动检查开关** — 优先级 **P2**
- 现象：当前只有手动"检查更新"按钮，每次都让用户主动点。
- 优化方向：在 update row 加一个 `自动检查更新` Switch（默认开）；状态持久化到 durable state。
- 实施方法：扩 `CatppuccinState` 增加 `autoCheck: boolean`；UpdateRow 注入新 setter。
- 预期效果：版本同步更主动；用户不必每次手动点。

**I. `UpdateRow` 缺 prerelease 选择** — 优先级 **P2**（后端已就绪，缺 UI 入口）
- **现状修正**：`selectNewest`（`src/update-check.ts`）与 `UpdateCheckPayload` **已经**支持 `channel: UpdateChannel`（`latest` / `beta`），`fetchLatestVersion` 也会把选中通道写进 payload；缺的只是 UpdateRow 上的「渠道」segmented 开关（当前只有手动「检查更新」按钮，且默认走 stable 不追 beta）。
- 优化方向：在 update row 加 `渠道` segmented（latest / beta），用户切到 beta 后下次检查才看 beta。
- 实施方法：UpdateRow 渲染 segmented；调用 check-update 时带上 channel（或由 Host 根据用户偏好选 channel）；偏好持久化到 durable state。
- 预期效果：beta 测试者能主动追新。

**J. settings row 缺 tooltip/帮助图标** — 优先级 **P3**（✅ **已实施（原生 title 落地）**）
- 现象：GlassRow 的 `modeHint` 是描述文字，混在 row 内；其他 row 没有"?" 帮助图标。
- **现状修正（2026-09-06）**：核查 `dsh-client-ui-slots`（0.1.2-rc.1）的导出，
  **没有 tooltip API**（grep tooltip/toast 仅命中 React 自身的类型）。实施说明：
  按「找不到就发起到上游」的规则不再等上游——三个 row 标题右侧加 `?` 帮助徽标，
  `aria-label` + 原生 `title` 承载说明，locale 增加 `*.help` / `*.helpLabel`
  字典（7 语言）；上游提供正式 tooltip API 后替换。
- 实施方法：用 dsh-client-ui-slots 已有 tooltip API；locale 增加 `*.help` 字典。
- 预期效果：发现性增强，新用户上手更快。

**TT. 覆盖编辑器的值输入逐键提交：清空值即删行（打字中途整行消失）** — 优先级 **P2**（✅ **已实施：方案 (a)，2026-09-15**）
- **实施结果（2026-09-15）**：值输入改为非受控 + `onBlur` 提交（与键名输入对称），`commitPersistedValue` 的「空值=删除」语义保留但只在失焦时发生。同时消掉了两个附带代价：每个字符都 `reapplyThemePrefs()`（dispose 并重登一次 700 token 的主题表）、中间态（如 `#89b4`）作为无效 CSS 生效。7 语言的 `row.overridesHint` 已同步为「失焦生效」。
- **有意接受的取舍（写在这里，免得下次被当成 bug）**：① 失去「边打边变色」——粘贴完整色值不受影响，且逐字符打字时中间态本来就是无效值 ；② 焦点未离开就关弹窗（Esc）时，最后一笔不提交；③ 其它标签页 / settings 文档写入的值要重开弹窗才刷新（非受控输入的固有行为）。三条与既有的键名输入完全一致。
- 现象：`CatppuccinRow` 里**已保存**条目的值输入框是受控 + 逐键提交（`value={value}` + `onChange → commitPersistedValue`），而 `commitPersistedValue` 把空串当删除（`if (value.trim() === '') delete next[key]`）。渲染源是 `Object.entries(overrideMap).map(...)`，所以光标还在框里、整行（含输入框）就被卸载：想重打一个新值只能「全选覆盖」（一次 onChange 即完整串，正常）或先按 ✕ 再新增；逐字符清空会中途丢行。每次按键还会连带 `reapplyThemePrefs()`（重新注册主题）+ `scheduleDurablePersist`。
- **这是文档化的设计，不是缺陷**：7 种语言的 `row.overridesHint` 都写着「输入即生效，清空值即删除」/ "Applies as you type; an empty value deletes the entry"。改行为等于同时改 7 条 i18n 文案 + 一条交互承诺，属产品决定。
- 为什么暂缓（2026-09-13）：三条路线行为互斥，需 maintainer / 视觉复核拍板，且不阻塞发版（✕ 按钮一直在，现状是「粗糙」不是「坏掉」）：

  | 方案 | 行为 | 代价 |
  |---|---|---|
  | (a) 非受控 + `onBlur` 提交（与键名输入对称） | 变成「失焦生效，清空值即删除」；逐字符清空不再丢行 | 7 条文案改「失焦生效」 |
  | (b) 保留即时生效，清空不删行而留草稿行 | 打字全程稳定 | 需加「空值不注册」分支，否则会写出 `--x: ''`，让该 token 变成无效 CSS 值 |
  | (c) 只留显式 ✕ 删除 | 最接近常见 KV 编辑器 | 推翻的现有承诺最多 |

- 建议（若采纳）：走 (a)，与 2026-09-13 已改的键名输入（非受控 + 失焦提交）对称，两个输入框语义一致——`<input defaultValue={value} onBlur={(e) => { commitPersistedValue(key, e.target.value) }} />`，`commitPersistedValue` 的「空串=删除」保持不变，只改 7 处文案为「失焦生效，清空值即删除」。
- 关联文件：`src/client/CatppuccinRow.tsx`、`src/client/locales.ts`（`row.overridesHint`）。
- 附注：**键名**输入已在 cdccb09 改为非受控 + 失焦提交，原因是 `readOverrides()` 改为 read 侧 sanitize 后，逐键重写的中间态（`-`、`--`）会被丢弃并让整行消失；值路径对任意字符串都合法，没有同类新风险，故当时维持原设计。（该判断已在 2026-09-15 被 TT 的实施修正：值路径确实没有键名那类失效风险，但**逐键提交本身有另外两个代价**——逐键重建主题、中间态无效值。）

**XX. 覆盖编辑器「+ 添加」的新行在值第一个字符后夺走焦点** — 优先级 **P2**（2026-09-15 复核新增，**待评估 / 待反馈**）
- 现象（读码得出，**未实机确认**）：新建覆盖按常规顺序「先填键名、再填值」——键名已是合法 `--` token 时，`commitDraft` 的提交条件只需值非空，所以**键入值的第一个字符**就会把该草稿行转成持久化行（`draftRows.filter(...)` 卸载草稿行 + 覆盖表新增一行），正在打字的输入框被卸载、焦点丢失，后续字符无处可去。值靠粘贴（一次 onChange 即完整串）时无感。
- 为什么没随 TT 一起改：TT 只动「已持久化行」的值输入；这条是草稿行 → 持久化行的**转换时机**问题，要决定「何时算一条新覆盖成型」（值字段失焦？显式确认？），属产品决定，且同样会连带 7 语言文案。
- 候选方向：草稿行的两个输入也改成失焦提交（键名 + 值都失焦且都合法时才转持久化），与 TT 后的语义一致；代价是新建一条覆盖要先在值框外点一下。
- 关联文件：`src/client/CatppuccinRow.tsx`（`commitDraft` 与 draftRows 渲染）。

---

### 3.3 主题与皮肤

**K. 缺用户覆盖单 token 的能力** — 优先级 **P2**
- 现象：调色板完全由 `palettes.ts` 决定，用户想"mocha 但 comments 改成蓝色"做不到。
- 优化方向：在 CatppuccinRow 底部加"自定义覆盖"折叠区，支持 `--dsw-static-blue-500: #xxxxxx` 这种 KV 列表，写到 localStorage + Host state。
- 实施方法：扩 `CatppuccinState` 增加 `overrides: Record<string, string>`；主题注册时合并 `flavor.tokens` + overrides；CSS 用 `Object.assign(document.documentElement.style, ...)` 应用。
- 预期效果：高级用户拥有 power-user 通道；插件可玩性提升。

**L. `generate-palettes.mjs` 未锁定上游版本** — 优先级 **P2**
- 现象：注释里写 `palette.json v1.8.0`，但脚本**从本地缓存** `../../.cache/dsh-ref/catppuccin-palette.json` 读取（非运行时联网），没有版本检查/锁定；缓存被替换或手改就会悄悄同步。
- 优化方向：脚本支持 `--pin <sha>` 标志，把上游 commit SHA 写入生成文件头部 `// UPSTREAM_PIN: <sha>`。
- 实施方法：拉 palette.json 时记录 etag/commit；生成时把 SHA 嵌入 `palettes.ts`。
- 预期效果：上游改色不会被"悄悄同步"；升级可审计。

**LL. 次级文字 token 映射过暗** — 优先级 **P1**（✅ **已实施（issue #7 批次），本条可关闭**）
- **复核结论（2026-09-15）**：本文「优化方向」所要求的映射**已经在树里**——`src/client/palettes.ts:326` 暗色 `--dsw-alias-label-secondary` = `bluish-150`（= `subtext0`）、`:327` `label-tertiary` = `bluish-200`（= `overlay2`），逐字符合提案；`tests/palettes.spec.ts:197` 已用 WCAG floors 锁死（菜单 secondary 4.0 / tertiary 3.0，页面 6.0 / 5.0）。**重做即白干，勿再排期。**
- 现象：暗色风味下侧边栏分组标签、会话时间戳、底部入口等次级文字对比度目测 < 3:1（实测截图可见）。根因是 `generate-palettes.mjs` 把 `--dsw-alias-label-secondary/tertiary` 映到了 Catppuccin 较暗的 overlay 层级。
- 优化方向：暗色三风味 secondary 提一档到 `subtext0`、tertiary 到 `overlay2`；Latte 同步核对。
- 实施方法：改 `scripts/generate-palettes.mjs` 的映射表后 `pnpm gen:palettes` 重生成，勿手改 `palettes.ts`。
- 预期效果：弱光环境可扫读，WCAG AA 达标；与 BB（运行时对比度警告）互补——本条从源头修，BB 做兜底。

**MM. 暗色下主 accent 可读性不足** — 优先级 **P1**（❌ **已驳回，2026-09-15 复核**）
- **复核结论（2026-09-15）**：三条理由，任一成立即不该做。
  1. **前提是审美而非可读性**：本文自己写的是「发闷」，而 `#8caaee`(Frappé) / `#89b4fa`(Mocha) 落在 `crust` 上远高于 AA——不存在对比度缺陷，不存在可判定的验收标准。
  2. **过不了「偏离官方取值」的门槛**（规则 1：官方取值在 DSH 下确实不成立才可改，需证据 + 已穷尽不换色相手段）：`#8caaee` / `#89b4fa` 在 `crust` 上远高于 AA，拿不出「不成立」的证据；且 `--dsw-alias-brand-primary-new-colorprimary-new-color` 已被 `tests/palettes.spec.ts:105` 锁成 brand pin 契约，换 sapphire/sky 或统一提亮还会让三风味的蓝趋同、丢掉风味差异。（**注意**：驳回理由不是「官方色不许动」——允许有据偏离，见同一份 AGENTS.md 规则 1。）
  3. **已有用户侧出口**：想更亮的主操作色，用 **K（token 覆盖，已实施）**直接覆写对应 token；RR（accent 自定义 UI）只是 K 的可视化外壳，不是新能力。
- 结论：**驳回**，不再作为 palette 层改动；不写进任何发版批次。
- 现象：Mocha 的 blue `#89b4fa` 族在深底上发闷，发送按钮等唯一主操作点不够"跳"。
- 优化方向：暗色风味的 `--dsw-alias-brand-primary-*` 一族换更亮的 sapphire/sky，或 color-mix 提亮 ~10%。
- 实施方法：同 LL，改 `generate-palettes.mjs` 映射后重生成。
- 预期效果：主操作点在暗色下视觉权重正确，引导点击。

**M. Shiki tokens 仅一套样式** — 优先级 **P3**
- 现象：所有风味都用同一套 `SHIKI_TOKENS` 配色风格（粗体、italic 等）。
- 优化方向：可选"italic comments" / "rainbow brackets"等子选项。
- 实施方法：扩 `CatppuccinState` 增加 `shikiStyle: 'default' | 'italic-comments'`；`SHIKI_TOKENS[flavor][style]` 二维表。
- 预期效果：差异化卖点。

**N. Glass 皮肤的 MutationObserver 未防抖** — 优先级 **P1**
- 现象：`startGlassSeamStamper` 在 `glass-seams.ts` 里监听 DOM 变化加接缝 stamp；DSH chat 流式输出时每条 token 都触发 DOM 变化。
- 优化方向：用 `requestAnimationFrame` 合批 stamp 应用；或只在 `glass-layer` 切换 + 路由变更时跑一次。
- 实施方法：`queueMicrotask` 或 rAF 合批；记录"上一次 DOM signature"，相同则跳过。
- 预期效果：聊天流式输出时主线程负担 -80%。

**O. Glass 不尊重 prefers-reduced-motion** — 优先级 **P1**（✅ **已实施，本条可关闭**）
- **现状修正**：`glass.module.css:628` 已有 `@media (prefers-reduced-motion: reduce)` 块，对 hero/active/view/dialog 等动画置 `animation: none`。
- 残留（可选）：当前只关 `animation`，未显式关 `transition`；如需彻底，可把 `transition: none` 一并纳入该媒体查询。
- 预期效果：已符合 WCAG 2.3.3。

**P. Glass 缺高对比度模式** — 优先级 **P1**（▲ **视觉批次，前置：截图流水线**）
- **复核结论（2026-09-15）**：方案本身（强制 surface 不透明 + 文字加深）是**观感决策**，效果必须看，只有「顺眼 / 不顺眼」没有 fail / pass；且 `prefers-contrast` 在仓库确认为 0 处（只有 `prefers-reduced-motion`，见 O 条）。当时归入视觉批次，**前置 = 截图流水线能出 4 风味图**（见 FF 条）——没有 baseline 的观感改动无法回归。
- **复核结论（2026-09-18）：❌ 不推进（原诉求拆两半，两半都不成立）**：
  1. **「强制 surface 不透明」已存在**，不需要新代码——`glass-row.tsx:221-229` 的**总开关**一关就是原版不透明界面，`glass.modeHint` 也已写明兼容模式「不模糊大面积区域、性能更稳妥」。再做一个 high-contrast 开关只是把同一能力换个名字。
  2. **「文字加深」是 palette 层偏离**，按规则 1 需要「官方取值在 DSH 下确实不成立」的证据（低视力用户实测 / 上游对比度缺陷）；当前既无 `prefers-contrast` 用法，也无任何用户反馈，拿不出证据。

  ⇒ 判 **❌ 不推进**，与 `D`（插件适配 DSH，不改变 DSH）同一思路。若将来真有低视力用户反馈，只做「强制不透明 + 保留官方色」的**最小版**，不深化文字色（否则又是一次无据偏离）。
- 现象：磨砂 + 低饱和底色下，正文对比度可能掉到 4:1 以下，未达 WCAG AA。
- 优化方向：GlassRow 增加"高对比度"开关，启用时强制 surface 不透明 + text 颜色加深。
- 实施方法：扩 `GlassSettings` 增加 `highContrast: boolean`；CSS 加 `.high-contrast { backdrop-filter: none; --text-contrast-boost: 1 }`。
- 预期效果：低视力用户也能用 glass 主题。

**OO. compat 模式材质过于保守** — 优先级 **P1**
- 现象：`data-dsh-glass-compat` 分支只给 menu/card/popover 加 12px blur，填充仍是不透明原生色（`glass.module.css:602-625`），用户开兼容模式后几乎感知不到插件存在——实测截图正是此状态，观感≈原生暗色。
- 优化方向：compat 也注入半透明 fill + hairline rim（复用 `--dsh-glass-card-raised` / `--dsh-glass-rim`，不动布局）；并在 mode picker 文案明确"兼容模式 = 仅材质，浮动模式 = 完整皮肤"。
- 实施方法：compat 段补 `background` / `border` 规则，复用既有 `--dsh-glass-*` 变量。
- 预期效果：与 Q 互补——Q 解决"用户看不懂两种模式"，本条解决"compat 本身看不出皮肤"。

**Q. mica / compat 模式视觉差异不明显** — 优先级 **P3**
- 现象：截图对比两者，肉眼几乎看不出区别。
- 优化方向：在 row 内对 mode picker 加一段 2 行的 micro-preview（左边 mica 卡片浮起、右边 compat 平铺）。
- 实施方法：抽 `<LayoutPreview>` SVG 组件。
- 预期效果：用户能直观理解模式含义。

**NN. hero 空状态毫无皮肤感** — 优先级 **P2**
- 现象：`data-phase='hero'` 只有一条 0.32s 淡入动画（`glass.module.css`），标语「探索未至之境」为纯默认文字，主区大留白，页面像"没加载完"。
- 优化方向：hero 阶段标语上 accent 渐变文字（`--dsw-alias-brand-*` → linear-gradient），背景加极淡径向光晕（风味 accent @ ~6%），纯 CSS 零 JS。
- 实施方法：`glass.module.css` 增加 `[data-phase='hero']` 作用域规则；四风味自动跟随 token。
- 预期效果：空状态从"空白"变"品牌页"，四风味各有签名色。

**PP. 会话列表选中/悬停反馈弱** — 优先级 **P2**
- 现象：已有 `[role='treeitem'][aria-selected='true']` 的 accent 条（`glass.module.css`），但选中态只有阴影无底色、普通 hover 无反馈规则，列表定位感弱。
- 优化方向：补 `treeitem:hover` 的 `--dsh-glass-card-hover` 底；选中态改为 fill + accent 条组合。
- 实施方法：`glass.module.css` 追加两条规则。
- 预期效果：列表可定位、可扫读。

**QQ. 纯色底下 blur 无内容可模糊** — 优先级 **P2**
- 现象：body 底色为纯色（`glass.module.css` 的 canvas 规则），纯色底下 backdrop-blur 没有可模糊的内容，磨砂感大打折扣，玻璃看不出"玻璃"。
- 优化方向：新增可选背景层：风味极光渐变（多 accent 色 mesh gradient）或用户自定义图片，铺在 body 底。
- 实施方法：`catppuccin-state.json` 加 `background` 字段（注意 Y 的迁移约定）；GlassRow 加背景选择；CSS 加背景层规则。
- 预期效果：玻璃皮肤真正"透"出内容——观感杠杆最大的一条，皮肤类插件的招牌特性。
- **复核结论（2026-09-18）：❌ 不推进（三条，任一成立即不该做）**：
  1. **对外已定案**：issue #9「是否可以支持自定义壁纸」已由维护者关闭，答复原话是「感觉当前插件定位不太适合加上自定义壁纸功能」，并给出 5 个社区皮肤插件（DSH-Transparent-UI-Plugin / dsh-dream-skin / dsh-gui-customization / dsh-client-ui-custom / dsh-skin）配合使用——与 `cb21371`「插件适配 DSH，而非改变 DSH」同一思路。
  2. **与 ZZ 直接冲突**：本皮肤把页面地面强制成纯色正是 0.5.3 性能修复的前提；背景层一旦不是纯色，`backdrop-filter` 就**不再是恒等变换**，ZZ 删掉的 4 处 blur（mica 460k → 236k px²、mica/compat 4.32× → 2.22×）全部作废，还要重新承担 issue #13 量到的每帧 backdrop 回读。
  3. **会让 `tests/glass-css.spec.ts:64` 的前提失效**：那条「背后只有地面就不许 blur」的锁，理由就是「地面是纯色」。加了背景后测试**仍然绿**（按选择器匹配），但锁守的理由消失——**假绿比没有锁更糟**。

  ⇒ 这不是视觉批次里的 P2，属**架构级反悔**：要真做，必须单独立项、重新测 GPU、并重写 `glass-css.spec.ts` 的不变量。

**RR. 缺每风味 accent 自定义** — 优先级 **P2**
- 现象：accent 固定跟随风味（Mocha 只能 blue 系），用户想"Mocha 底 + mauve 点缀"做不到。
- 优化方向：开放 Catppuccin 官方 14 色（mauve/pink/teal…）做 accent 覆盖，重映射 `--dsw-alias-brand-*` 一族。
- 实施方法：`CatppuccinState` 加 `accentOverride` 字段；CatppuccinRow 加色板选择器。与 K（任意 token KV 覆盖）是父子关系——本条是 80% 用户想要的简化入口，K 服务 power user。
- 预期效果：个性化卖点，与官方主题系统差异化。

**AAA. 插件市场卡片背景不透明** — 优先级 **P1**（✅ **已实施，2026-09-18**）
- **现象**：设置 → 插件市场对话框内，插件卡片显示为不透明深色块（`#313244` 等实色），未应用玻璃态半透明效果，与对话框面板不协调。
- **根因**：插件卡片使用 `--dsw-alias-bg-layer-1` token，但 `[data-dsh-glass-settings]` 规则只重写了 `layer-2` / `layer-3` / `module-platform`，遗漏了 `layer-1`。
- **修复**：在深色/浅色两条规则中补充 `--dsw-alias-bg-layer-1` 的玻璃态重写，使用 `soft` 档位透明度（因 layer-1 低于 layer-2/layer-3）。
- **验收**：重载插件后打开插件市场，卡片背景变为半透明玻璃态。
- 关联文件：`src/client/glass/glass.module.css` (:285 深色 / :303 浅色)。

---

### 3.4 TUI 集成

**R. 用户自定义 `catppuccin-*.json` 会被覆盖** — 优先级 **P2**
- 现象：`syncTuiThemes` 用文件内容比对决定写不写——但若用户改了 `catppuccin-mocha.json` 内的某个色，插件升级时会"贴心"覆盖回去。
- 优化方向：检测到目标文件存在 + 异于 ship 副本时，改为 `.bak` 备份 + 写新版本，并在 UpdateRow 给一条"你的自定义已被备份到 catppuccin-mocha.json.bak"提示。
- 实施方法：`syncTuiThemes` 增加 `onConflict: 'overwrite' | 'preserve' | 'backup'` 选项，默认 backup。
- 预期效果：用户自定义不会被静默吞掉；透明可恢复。

**S. 缺 dry-run 模式** — 优先级 **P3**
- 现象：用户/贡献者无法预览同步会改哪些文件。
- 优化方向：`syncTuiThemes` 增加 `dryRun: true` 参数，返回 planned writes。
- 实施方法：纯函数化已有逻辑 + 一个开关。
- 预期效果：方便文档/调试。

**T. 缺社区主题扩展机制** — 优先级 **P3**
- 现象：插件只装 4 个官方 JSON，社区无法贡献。
- 优化方向：扫描 `~/.dsh-tui/themes/catppuccin-community/` 子目录（用户/其他插件放入），同步但不覆盖。
- 实施方法：`syncTuiThemes` 增加第三目录 `communityDir`，只读同步。
- 预期效果：生态可扩展；本插件保持轻量。

---

### 3.5 更新检查

**U. 缺离线/网络错误分类** — 优先级 **P2**（枚举已比原估更细，缺的是 local/upstream 二分）
- **现状修正**：`UpdateErrorCode`（`src/update-check.ts`）实际有 6 个值：`ok` / `network` / `registry-unreachable` / `registry-http` / `no-dist-tags` / `invalid-response`，且 `fetchLatestVersion` 已按 fetch 失败、HTTP 非 2xx、JSON 解析失败分别返回不同 code。原估「只有 network / registry-unreachable」已不成立。
- 残留问题：`network`（fetch 自身失败）与 `registry-unreachable`（超时/不可达）在用户文案上仍混为一谈，无法区分「我家网断了」与「npm 挂了」。
- 优化方向：把 `network` 细分为 `network.local`（fetch 抛错/DNS 失败）/ `network.upstream`（超时）；UpdateRow 文案分别给「检查你的网络」/「npm registry 暂时不可用」。
- 实施方法：error code 增加两个；UpdateRow 按 code 选文案。
- 预期效果：用户自助排查时间 -50%。

**V. 缺重试退避** — 优先级 **P3**
- 现象：失败后用户只能手动"重试"按钮，没有自动退避。
- 优化方向：失败 30s 后自动重试一次，仍失败则停。
- 实施方法：`handleUpdateCheck` 包一层 retry wrapper；UI 上显示"30s 后自动重试"。
- 预期效果：偶发网络抖动时无感恢复。

**W. 缺 ETag/304 缓存** — 优先级 **P3**
- 现象：5min TTL 内不再请求，但 5min 边界外每次都重新拉全量 packument。
- 优化方向：把 packument 的 etag 存到 Host 文件，下次带 `If-None-Match`，304 命中即用缓存。
- 实施方法：`update-cache` 扩 `etag?: string`；fetch 带 header。
- 预期效果：npm 流量 -90%。

---

### 3.6 状态持久化

**X. 多 tab / 多窗口写冲突** — 优先级 **P2**（**写侧已由 revision fencing 覆盖，读侧仍是 gap**）
- **现状修正**：0.5.0 的 Client→Host 写路径（`src/client/state-sync.ts` 的 `persistStateToScope`）走 `scope.mutate(...)`，是 **revision-fenced 原子写**，Host 侧可以拒绝过期 revision——「最后一个写覆盖前一个」的写侧竞态已由 seam 机制解决，不需要应用层自己实现乐观锁。
- 残留问题：revision fencing 只在「写」时生效；多 tab 下 **localStorage（浏览器内缓存/跨 tab 总线）与 settings document 的读取一致性**未定义。典型场景：tab A 从 localStorage 读到旧值、用户改了 flavor 后写回，可能覆盖 tab B 已通过 settings 提交的新值；用户也无从得知哪个窗口赢。
- 优化方向：写回前比对 scope snapshot 的 revision / `updatedAt`，早于远端则放弃本地写；UpdateRow 在被覆盖时给 toast「另一窗口已更新，本地改动未保存」。与 C 是同一问题的两面，合并实施。
- 实施方法：在 `persistStateToScope` 前加 revision 检查；`CatppuccinSettingsSection` 增加 `updatedAt`（需上游 settings schema 支持）。
- 预期效果：多 tab 行为可预测。

**Y. Schema 迁移路径缺失** — 优先级 **P2**
- 现象：`STATE_VERSION = 1`（`src/state.ts`），但 v2 怎么迁没人写。注意 0.5.0 已经过一次真实迁移：`src/index.ts` 的 `migrateLegacyStateOnce` 把 pre-0.5.0 的 legacy JSON 文件一次性滚进 settings document，但那是一次性脚本，不是通用的 schema migrate 机制。
- 优化方向：写一份 `docs/state-migrations.md`，约定 `state.version` 升级时的步骤；代码加 `migrate(v1 → v2)` 函数。
- 实施方法：在 `src/state.ts` 增加 `migrate(raw: unknown): CatppuccinState`（当前只有 `sanitizeState` 做字段归一，不做版本升级）。
- 预期效果：未来加字段不破坏老用户状态。

---

### 3.7 可访问性

**Z. slider 缺 aria-valuetext** — 优先级 **P1 → P3**（✅ **已实施：零文案版，2026-09-15**）
- **复核结论（2026-09-15）**：本文原方案要 locale 提供 `glass.frost.valueText(50)` → 「中等磨砂」，即 **3 个 knob（磨砂 / 模糊 / 亮度）× 7 语言 = 21 条新文案** + 一张档位阈值表（还要与 `tests/locales.spec.ts` 的 key 集合锁步）。它给的东西**超过**了无障碍要求：视力用户在这一行读到的也只是数字框里的 `20%`，原方案让屏幕阅读器用户听到的比视力用户更多（语义档位名），属于「更好」，不是「够用」。
- **改为零文案版**：`aria-valuetext={`${value}${unit}`}` —— `unit`（`%` / `px`）已是现有渲染字段（`glass-row.tsx` 的 `.unit` span），屏幕阅读器从「20」变成「20%」/「14px」，与视力用户所见**完全一致（parity）**，7 语言零成本、无阈值表、无新 locale key。
- 档位名版本保留为可选后续：**只在新版本真的收到屏幕阅读器用户反馈时再做**，不预先付成本。
- 现象：GlassRow 的 Knob 用了 `<input type="range">`，但 `aria-valuenow` 是数字，对"50%"这种语义屏幕阅读器读不出"中等磨砂"。
- 优化方向：locale 增加 `glass.frost.valueText(50)` 返回"中等磨砂"；`Knob` 组件绑 `aria-valuetext`。
- 实施方法：纯属性扩展。
- 预期效果：屏幕阅读器用户能听懂每个 knob。

**AA. 键盘导航覆盖** — 优先级 **P2**
- 现象：CatppuccinRow 按钮可用 Tab + Space/Enter；但 GlassRow 的 segmented + slider 用方向键调节的体验没验证。
- 优化方向：slider 加 `onKeyDown` 处理 Arrow/Home/End；segmented 加 roving tabindex。
- 实施方法：WAI-ARIA Authoring Practices 标准做法。
- 预期效果：键盘可达性达到 AAA。

**BB. GlassRow 颜色对比警告** — 优先级 **P1**（▲ **缓做，且只做静态阈值版**）
- **复核结论（2026-09-15）**：实时算 fg/bg 在 glass 下**不可靠**——背景是半透明 surface 叠 `backdrop-filter`，同一 token 在页面 base / 卡片 / 弹窗上落地结果不同，`getComputedStyle` 读到的 token 值不代表实际观感，算出来的「< 4.5:1」很可能是误报。**误报比不报更伤信任**（用户会学会忽略这条警告）。
- 若要做，只做**静态阈值版**：用户把 brightness 推到极值（|Δ| 超阈值）时给一句定性提示，不做实时计算、不下对比度结论。优先级保持 P1 但标记为**非必要**，排在视觉批次之后。
- 现象：开启 glass + 高 brightness 在 light 主题下，文字可能糊掉。
- 优化方向：开启 glass 时自动跑一遍 contrast check，< 4.5:1 则在 row 显示警告条"此设置降低对比度"。
- 实施方法：抽 `getContrastRatio(fg, bg)`；在 row 内做轻量校验。
- 预期效果：避免无障碍事故。

---

### 3.8 国际化

**CC. 仅 zh/en，覆盖不足** — 优先级 **P2**
- 现象：locale 只两个字典；DSH 官方已有更多语言。
- 优化方向：补 ja / ko / es / fr / de 字典；CI 加 `tests/locales.spec.ts` 断言字典 key 集合一致（已有 zh 作 source-of-truth）。
- 实施方法：扩 `locales.ts`；加 vitest 用 `Object.keys(zh)` 对其他语言跑断言。
- 预期效果：海外用户覆盖率 +30%。

**DD. 风味名硬编码英文** — 优先级 **P3**
- 现象：`Latte / Frappé / Macchiato / Mocha` 是品牌名，不能改；但 subtitle 可以本地化（如 "Latte（浅色）"）。
- 优化方向：locale 增加 `flavor.<id>.subtitle`；CatppuccinRow 在 label 下方渲染小字。
- 实施方法：扩 `CatppuccinFlavorInfo` 增加可选 subtitle key。
- 预期效果：本地用户更易区分风味。

---

### 3.9 测试与文档

**EE+FF. 宿主启动级 e2e + 视觉回归（2026-09-21 合并立项，待评估）** — 优先级 **P2**

**为何合并**：两件事的**前置条件完全同一**——都要在 CI 里「起一个真的 DSH web + 浏览器 + 把本仓库装进一个 profile」。分开做等于把同一套脆弱的引导流程写两遍；合并后一次启动就能同时跑行为断言与出图。

**已经做完的一半（不要重复做）**：

| 已做的 | 在哪 | 覆盖到哪 |
|---|---|---|
| 宿主**路由级** e2e | `tests/e2e/update-check.e2e.spec.ts` | 真 cordis + 真 HTTP + stub registry：路由 200 / channel 偏好 / 5 分钟缓存 / ETag 304 / 错误码 502 / settings namespace 已注册 |
| 截图流水线 | `scripts/screenshot-previews.cjs` | 端到端跑通（4 风味 + hero + 恢复原偏好），四张预览已用 0.5.4 重出 |
| **样式级**视觉断言 | `tests/glass-css.spec.ts`、`tests/palettes.spec.ts` | blur 预算两条不变量、composer 不重复读、PP 选中行填充、OO 面板不得被填、各语言对比度下限、品牌 pin — **CSS 悄悄坏掉的大部分情况已经被这些挡住** |

**缺口**：① 没有**启动级**验证（插件真被 DSH 加载、四个风味真注册上了、玻璃开关真能切）；② 截图 diff 没接进 CI。

**CI 可行性：2026-09-21 在本机实测了关键几步**（`DSH_HOME` 是现成的隔离开关）：

| 步骤 | 实测结果 |
|---|---|
| 全新 `DSH_HOME` 起 web | ✅ `dsh web --no-open --port 0` 正常，URL + token 打在 stdout（`--port 0` 让 OS 选端口，适合 CI） |
| 首次启动引导 | ⚠️ **有≥2 步宿主引导**：先「内测声明 → 继续」，再「添加一个 API Key 开始使用」（`稍后配置` / `保存并继续`）；**引导走完之前设置入口被遮罩挡住**（实测点 `设置` 被 mask 拦截、直接超时） |
| 把本仓库装进那个 profile | ✅ `DSH_HOME=… dsh plugin --profile web add link:<repo>`，236 ms（本地 link，不走网络） |
| 全新 profile 首次安装 | ⚠️ 自动拉了一整套 `profiles/node_modules`（CI 冷缓存下是**分钟级 + 大量网络**，需要 cache） |

⇒ **技术可行，但成本集中在两处**：宿主引导流程（属于 DSH，会随版本变）+ 全新 profile 安装（时间 / 网络）。

**四个方案（供评估）**：

| 方案 | 内容 | 成本 | 风险 | 收益 |
|---|---|---|---|---|
| **A. 不接 CI** | 维持现状：脚本 + 样式级断言；发版前手动重出预览（`AGENTS.md` 有步骤） | 0 | 无 | 视觉改动靠**人**在发版前看一眼 + 样式断言兜底 |
| **B. 只做启动级 e2e** | CI 里用一份**预置好的 DSH_HOME fixture**（已跳过引导）起宿主，断言行 / 风味 / 开关 | 中（要维护 fixture） | fixture 会随 DSH 版本过期 | 抓「插件没被加载 / 行没注册」这类真事故——**目前完全没覆盖** |
| **C. B + 像素对比** | 再接 Playwright 截图 + pixelmatch + baseline 入库 | 高 | 阈值 / 字体 / 动画 → flaky；失败信息对维护者不友好 | 抓「预览被悄悄改坏」——但样式断言已覆盖大半 |
| **D. 折中：B + 关键区域采样** | 启动级 e2e 里不只断言行为，还对**关键元素**取计算样式 / 小区域像素（如选中行背景、compat 面 outline） | 中 | 低（不做整图 diff） | 拿到大部分「视觉回归」价值，几乎无 flaky |

**需要拍板的四件事**：
1. 走 A / B / C / D 哪个？
2. 若走 B/C/D：要不要把 `playwright` 加进 devDependencies（现在脚本依赖全局 `@playwright/cli`，CI 里没有），Chromium 用 `npx playwright install --with-deps chromium`？
3. 引导流程怎么绕：提交一份预置 DSH_HOME fixture（要写清它含什么、怎么刷新），还是在 CI 里脚本化走一遍（脆弱）？
4. CI 时长预算：当前约 25 s；加宿主启动 + 浏览器预计 **+1~3 min**（冷缓存更久），接受吗？

**建议（可被推翻）**：**A，或 A+D 的后半**——不接整图 diff；若真想要启动级保障，按 D 的形态做（需先拿到稳定 fixture），否则就留在 A（手动 + 样式断言）。理由：本仓库已有的样式级断言已经很硬，整图像素对比的边际价值不高，而它的 flaky 与维护成本会在每次改 CSS 时持续收「税」。

**原文（保留作背景）**：EE 想要「起一个最小 web 加载插件，断言 4 个主题已注册、玻璃开关可切换、update-check 返回 200」；FF 想要「Playwright screenshot + pixelmatch，diff > 阈值即 fail，baseline 存 git LFS」。baseline 体积实测：四张风味图 **166~182 KB / 张**（合计 ~0.7 MB，全目录含玻璃图共 ~2.4 MB）——**就体积而论 LFS 并非必要**。

**GG. 缺贡献指南** — 优先级 **P3**
- 现象：`AGENTS.md` 极好，但只面向 maintainer；外部贡献者想加风味不知如何下手。
- 优化方向：写 `CONTRIBUTING.md`：怎么加风味 / 怎么改 token / palette 来源 / 测试要求。
- 实施方法：参考 catppuccin/catppuccin 自己的 contributing。
- 预期效果：降低外部贡献门槛。

**HH. 公开 API 缺 JSDoc/typedoc** — 优先级 **P3**
- 现象：`./client`、`./tui-themes` 导出对其他插件作者有用，但文档只在源注释里。
- 优化方向：跑 typedoc 生成 `docs/api/`；在 README 链接。
- 实施方法：`typedoc` package + GitHub Pages。
- 预期效果：插件生态可组合性。

**UU. 测试类型检查链路断链：`tsconfig.vitest.json` 有 4 处既有类型错误** — 优先级 **P3**（2026-09-13 复核新增，**待评估**）
- 现象：`npx tsc --noEmit -p tsconfig.vitest.json` 报 4 处错误，全部在**测试文件**里；而该配置头部注释写着「Vitest program: type-checks src + tests together without emitting」。
- 为什么一直没暴露（三条链路都不跑它）：
  - `pnpm typecheck` = `tsc --noEmit -p tsconfig.json`，其 `include` 只有 `["src"]` → 测试文件从不参与类型检查；
  - `pnpm test` = vitest（esbuild 转译，**不做类型检查**）→ 测试里的类型错误是隐形的；
  - CI（`.github/workflows/publish.yml`）只有 install / build / test + changelog 门禁 + publish，**没有 typecheck 步骤**；
  - `tsconfig.vitest.json` 只被 `vitest.config.ts` 喂给 `vite-tsconfig-paths` 做**路径解析**，不承担类型检查。即「配置写了、注释承诺了、没人跑」。
- 四处报错（均在 2026-09-13 未改动的测试文件里，非该修复引入）：

  | 位置 | 报错 | 根因 | 建议修法 |
  |---|---|---|---|
  | `tests/client.spec.ts:106` | 风味 id 不能赋给 `'light'`/`'dark'`/`'system'`/`null` | 测试故意传风味 id 证明「非内置值永不胜出」，但 `builtinPickWins` 第 2 形参被收窄成 `BuiltinPreference \| null` | 放宽签名为 `string \| null`（该参数只参与 `preference === livePick` 比较，语义等价），或测试内断言 |
  | `tests/client.spec.ts:166` | `ops` 隐式 any（strict） | 对象字面量整体 `as unknown as SettingsScope<...>`，没有上下文类型 | `mutate(ops: readonly SettingsPathOpView[])` |
  | `tests/reentrancy.spec.ts:78` | `Snapshot` 不能赋给 `ThemeSnapshot` | 本地 `Snapshot = {preference, revision}` 是刻意裁剪的，真实事件载荷是 `ThemeSnapshot`（含 `fontSize`/`active`/`themes`） | 监听器参数标为真实类型；或把 `getTheme()` 补到真实形状（契约判断，需 maintainer 定） |
  | `tests/versions.spec.ts:22` | 对象可能为 null | `parseVersion()` 返回 `ParsedVersion \| null`，直接取 `.prerelease` | 加 `!` 或先断言非空 |

- 为什么暂缓（2026-09-13）：全部落在未改动的测试文件里、不影响发版门禁与用户；其中两条触及契约边界（`builtinPickWins` 是 issue #6 的回归守卫；reentrancy 的 double 自称 "Faithful ThemeRuntime double"），需要在「放宽生产签名」与「测试内断言」之间取舍；在 bug-fix 提交里顺手改无关测试的类型会让 diff 语义变浑。
- 建议（若采纳）：单独一个 `test(types):` 提交，包含 ① `package.json` 加 `"typecheck:tests": "tsc --noEmit -p tsconfig.vitest.json"`；② 修上述四处；③ CI 增加 `pnpm typecheck:tests` 一步 —— **不接 CI 就必然再次腐烂**（它烂到今天的原因正是配置写了没人跑）；④ 若决定不接 CI，则把 `tsconfig.vitest.json` 的注释改为「仅用于 vitest 路径解析」，别让下一个人以为有人在跑。
- 关联文件：`tsconfig.vitest.json`、`tsconfig.json`、`vitest.config.ts`、`.github/workflows/publish.yml` 及上述四个测试文件。

---

### 3.10 性能与体积

**II. Glass CSS 副作用 import 即时挂载** — 优先级 **P2**
- 现象：`src/client/index.ts` 顶部 `import './glass/glass.module.css'` 把 ~几 KB 的 CSS 立刻塞进 `<style>`，即使用户从不开启 glass。
- 优化方向：CSS 只在 glass 启用时挂载（动态 `document.head.appendChild`）；或用 `<link rel="stylesheet">` 由浏览器按需加载。
- 实施方法：`glass-layer.ts` 在 `setEnabled(true)` 首次才 inject CSS；卸载时移除。
- 预期效果：未启用 glass 的用户首屏 CSS 体积 -X KB。

**JJ. 主题注册启动期全量** — 优先级 **P3**
- 现象：4 个风味的 tokens 在启动时全部注册到 ThemeRuntime，即使只用了 1 个。
- 优化方向：lazy-register：用户切到该风味时再注册；卸载时 dispose。
- 实施方法：`ctx.effect` 改为响应式：监听 `currentFlavor()` 变化。
- 预期效果：启动时 ThemeRuntime 注册项 4 → 1。

**KK. 缺 sourcemap 发布** — 优先级 **P3**
- 现象：tsdown 默认产物无 `.map`；debug 时只能看 lib/。
- 优化方向：`tsdown.config.ts` 加 `sourcemap: true`；`package.json` `files` 加 `"*.map"`。
- 实施方法：纯配置。
- 预期效果：用户报错 stack trace 可读。

---

## 四、优先级路线图

> ⚠️ 本节的 Sprint 划分写于 2026-09-05，**执行前先读「六、复核」**：Sprint 1 的六条里 O / LL 早已实施、MM ❌ 驳回、Z 降配、BB 缓做、P ❌ 不推进（2026-09-18）；Sprint 3 的 D ❌ 不推进；Sprint 4 的 QQ ❌ 不推进、FF ⏳ 半（定位器未修）、RR 可无限期推后；Sprint 5 的 B 已驳回。⇒ **Sprint 1 实际已零待办。**

| 阶段 | 项 | 工作量估算 | 价值 |
|---|---|---|---|
| **Sprint 1（A11y 合规，1 周）** | O（reduced-motion）、P（高对比度）、Z（aria-valuetext）、BB（contrast warning）、LL（次级文字 token 提档）、MM（暗色 accent 提亮） | 5 天 | 解锁无障碍 |
| **Sprint 2（稳定性，1 周）** | C（写冲突/读一致性）、N（seam stamper 防抖）、X（多 tab 读写一致性） | 5 天 | 杜绝边界 case 损坏 |
| **Sprint 3（plugin UX，1 周）** | D（row 分组）、E（按钮 wrap）、G（glass 预览）、SS（glass 预设档位）、H（auto-check）、I（prerelease 选择）、OO（compat 材质）、NN（hero 品牌化）、PP（列表反馈） | 5 天 | 用户主动使用率 +20% |
| **Sprint 4（扩展性，1 周）** | A（拆 host half）、K（用户覆盖 token）、RR（accent 自定义）、QQ（背景层）、EE（e2e）、L（palette pin）、FF（视觉回归） | 1 周 | 长期可维护 |
| **Sprint 5（打磨，按需）** | B、CC、II、JJ、KK、U、V、W、Y、GG、HH、S、T、J、Q、M、DD 等 | 持续 | 视觉/生态闭环 |

---

## 五、可量化预期收益

- **A11y 评分**（axe）：从估测 75 → 95+
- **首次启用 glass 的困惑率**（预览 swatch）：-40%
- **更新检查漏检率**（auto-check on）：用户手动检查点击 -60%
- **多 tab 状态冲突投诉**：0（乐观锁）
- **海外用户覆盖**（多语言）：+30%
- **CI 视觉回归覆盖率**：从 0 → 4 风味 × 2 模式 = 8 个 baseline
- **首屏未启用 glass 用户的 CSS 体积**：-X KB（lazy-load）

---

## 六、跟踪表（实施时填）

> 状态图例：✅ 已实施 ｜ ⏳ 部分实施 ｜ 🔸 已实施待复核 ｜ ▲ 上游阻塞 / 降配缓做 ｜ ❌ 已驳回 ｜ 待启动
> ⚠️ **状态列必须写可复核证据**（`文件:行` 或实测数字）：本表历史上出现过五条「表里写着待启动、代码里早已实施」的假账，2026-09-18 又抓到一条反向的——**FF 标着 ✅ 但端到端从未跑通**。状态词不算证据。

### 2026-09-15 复核：逐条回代码验证后的执行判决

> 复核方法：每一项都回到源码 / 测试实测，**不采信本表旧状态**。结论：20+ 行里真正值得做的只有 4 项——本表此前的问题是「已实施 / 待评估 / 待视觉 / 该驳回」全挤在同一个状态列里，于是看起来像一堆积压债务。各条的理由写在正文对应段落（前缀 **复核结论**）。

**立即做：0.5.2 批次（全部非视觉，均有可判定的验收证据）**

| 项 | 动作 | 验收证据 |
|---|---|---|
| **VV**（新，源自 CHANGELOG `[0.5.1]` 内联待办） | 暗色 `state-success-tertiary` / `state-warn-tertiary` 改走 `crust` 混色目标——`greenPlan` / `amberPlan` 的 900 步支持「混色目标」参数，与 `blueDarkPlan`（issue #11）同构 | 实测现状：green-500 on green-900 = **3.67 / 4.37 / 5.02**（Frappé、Macchiato ❌）；amber-600 on amber-900 = **3.18 / 3.79 / 4.34**（三风味全 ❌）。改 `crust@14%` 后预测 **5.40 ~ 9.34** ✅。新增 `tests/palettes.spec.ts` 断言（照 issue #11 用例的写法） |
| **UU** | 修 4 处既有类型错误（**不动生产签名**：`builtinPickWins` 是 issue #6 的回归守卫，改为在测试内标真实类型）+ 加 `typecheck:tests` + CI 一步 | `npx tsc --noEmit -p tsconfig.vitest.json` 实测仍 **4 错**，与记录一致；修后应为 0 错 |
| **TT**（已实施 2026-09-15：非受控 + 失焦提交，7 语言 hint 同步） | 走方案 (a) 非受控 + `onBlur` 提交，与已改的键名输入（cdccb09）对称 | 现状代码确认：值输入受控 + 逐键提交（`CatppuccinRow.tsx:333`），键名输入已是 `defaultValue` + `onBlur`（:325） |
| **Z**（降配后） | `aria-valuetext={`${value}${unit}`}`，零新文案 | 见正文 Z 条复核结论 |

> **2026-09-15 实施完成**：`VV`（暗色 900 步混向 `crust` 18%，实测 4.96~8.30）、`UU`（4 处修复 + `typecheck:tests` + CI 两步）、`Z`（零文案版 `aria-valuetext`）、`TT`（值输入改失焦提交，7 语言 hint 同步）+ 期间发现并修掉的 `glass-seams` dispose 契约与跨测试污染、幽灵类型依赖、CI pnpm 版本冲突，均已落地（0.5.2 已发布）。
>
> **其余全部转为「待评估 / 待反馈」**（2026-09-15 决定：不占当前排期，等具体需求或用户反馈再启动）：`BB`（只保留静态阈值版）、视觉批次 9 项（`F/G/Q/NN/PP/QQ/RR/OO/P`，前置仍是修 `screenshot-previews.cjs` 的 4 风味出图）、`D`（只余向上游提 issue）、`XX`（草稿行转换时机）、`YY`（非中英语音待母语复核）。
>
> **同日另补两项基础设施（不在本表内）**：`.github/workflows/ci.yml`（push main / PR 跑 install+typecheck+build+test——此前普通提交毫无验证，两次发版失败都因此漏到 tag 才暴露）与**组件测试骨架** `tests/rows.spec.tsx`（RTL + 注入面 fake；补上行的交互断言：覆盖编辑器的提交语义、玻璃旋钮的 `aria-valuetext`）。

**视觉批次（原 9 项）—— 2026-09-18 收尾：已实施 3 项，剩 4 项待评估**

- **前置条件已真正解除**（本节前后改了两次：先是误标「已解除」，后又标「尚未满足」——现在有实测）：`screenshot-previews.cjs` 已**端到端跑通**（2026-09-18 实测：4 风味 + hero 图 + 成功恢复原偏好，日志 `DONE`）。真因和 `pickFlavor` 无关：**① `page.goto` 没带 token → 401 空白页 → `openSettings` 等 90s 超时；② 行标题自 J 项加 `?` 帮助徽标后 `getByText(..., {exact:true})` 恒为 0；③ 「跟随系统」在弹窗里有两处（外观分段 + Catppuccin 行）**。任何视觉改动现在都能先出 baseline。
- **已实施（2 项 + 1 项半）**：`PP` ✅（选中行真底色，四风味实测对比度 5.89 / 8.29 / 10.07 / 11.38）、`OO` ✅（compat 浮动家族补填充 + outline rim，`panel` 有意不填——嵌套会叠出内框）、`FF` ⏳ **半**（脚本已修好并跑通、四风味预览已重出；**CI 像素对比未做且需先决策**，见 §3.9 FF 条）。另 `P` / `QQ` / `G` 三条 ❌ 不推进（见正文）。
- **仍在本批次（3 项）**：`F` / `Q` / `NN`（`RR` 可无限期推后；`G` 已判 ❌ 不推进，见正文复核结论）。其中 `RR` 在 K（token 覆盖）已实施之后只是「可视化外壳」。（`SS` 原列在本批次，2026-09-15 复核发现**已实施**（`ca979ba`）已移出——见正文 SS 条。）

**驳回 / 关闭（不要再排期）** —— `LL` ✅ 已在树中（重做即白干）、`SS` ✅ 已在树中（`ca979ba` 三档预设，重做即白干）、`MM` ❌ 伪需求（无「官方取值在 DSH 下不成立」的证据，属审美偏好；brand pin 已锁契约，要更亮的蓝走 K）、`B` ❌ YAGNI、**`QQ` ❌ 不推进**（2026-09-18：issue #9 已对外关闭并推介社区皮肤插件；且背景层会让 ZZ 的性能修复归零、`glass-css.spec.ts` 的前提失效——属架构级反悔）、**`P` ❌ 不推进**（2026-09-18：原诉求拆两半都不成立——「强制不透明」已由总开关 / 兼容模式提供，「文字加深」是缺证据的 palette 偏离）、`BB` ▲ 仅保留静态版、`D` ❌ 不推进（插件适配 DSH，不改变 DSH）。

**四、优先级路线图需要按此修正**：Sprint 1 的六条（O / P / Z / BB / LL / MM）现状是 O ✅ 与 LL ✅ 早已实施、MM ❌ 驳回、Z 降配、BB 缓做、P 归视觉批次——**Sprint 1 实际只剩 Z 一条要做**。

**本次审计暴露的机制问题（值得留在表里）**：`O`、`LL` 两条「表里有、代码里已了结」`MM`、`B` 两条伪需求，加上 2026-09-15 文件审计又发现 **`SS` 也是「已实施但表里写着待启动」**（`ca979ba`）——五条的审计成本全部来自状态列只写「待启动」、不写证据。**今后新行一律在状态列写可复核的证据（`文件:行` 或实测数字），不只写状态词。**

**2026-09-15 文件审计另立一项**：**WW**（`docs/api/` typedoc 产物曾过期；同日复核已确认那条 `origin` remote 警告是**虚警**、链接本身正确）——已记入跟踪表末行并**定案选 C（移出版本库、本地按需生成）**；同日审计还修了 `AGENTS.md` 行号、`CONTRIBUTING.md` 路径与「不要打 tag」矛盾、`docs/non-vision-start-prompt.md` 的版本快照，以及仓库卫生项（`.pnpm-store/`、`screenshots.json`、`assets/previews/combine.py`、npm 包里的 `assets`）。

| ID | 项 | 优先级 | 状态 | 关联文件 | 关联 PR |
|---|---|---|---|---|---|
| C | 持久化读侧一致性（写侧已由 seam 覆盖） | P1 | ✅ | `src/client/state-sync.ts`、`src/client/index.ts` | — |
| X | 多 tab 读写一致性（与 C 合并实施） | P2 | ✅ | `src/client/state-sync.ts`、`src/client/UpdateRow.tsx`（conflict 横幅） | — |
| N | seam stamper 防抖 | P1 | ✅ | `src/client/glass/glass-seams.ts`（rAF 合批 + dirty 跳过；**2026-09-15 补 `disposed` 守卫**——dispose 后已排队的 observer 回调不再能重排帧） | — |
| H | auto-check 开关 | P2 | ✅ | `src/state.ts`、`src/client/UpdateRow.tsx`（启动 + 每 6h） | — |
| I | prerelease 选择 | P2 | ✅ | `src/state.ts`、`src/client/UpdateRow.tsx`、`src/update-check.ts`（selectNewest 三态）、`src/update-check/host.ts`（per-channel 缓存） | — |
| J | tooltip/帮助图标 | P3 | ✅ | `src/client/{CatppuccinRow,UpdateRow}.tsx`、`glass/glass-row.tsx`、`src/client/locales.ts`（原生 title 落地，上游无 API） | — |
| E | 按钮 wrap | P1 | ✅ | `src/client/CatppuccinRow.tsx`（既有实现，确认关闭） | — |
| D | row 分组 | P3 | ❌ 不推进 | 上游 `settings.general.item` 无 group/label 支持。**决策（2026-09-18）**：不向上游提特性请求——插件适配 DSH，不是改变 DSH；上游项目大且有自身设计考量；三行挨在一起实际可用性尚可，性价比不足 | — |
| A | host half 拆分 | P2 | ✅ | `src/update-check/host.ts`（路由/缓存/etag/channel 迁出，index.ts ≤120 行） | — |
| K | token 覆盖 | P2 | ✅ | `src/state.ts`（`overrides`）、`src/client/CatppuccinRow.tsx`（折叠 KV 编辑器）、懒注册时合并 | — |
| R | TUI 自定义保护 | P2 | ✅ | `src/tui-themes.ts`（`onConflict` 默认 backup → `.bak`） | — |
| S | dry-run | P3 | ✅ | `src/tui-themes.ts`（`dryRun` 返回 planned writes） | — |
| T | 社区主题 | P3 | ✅ | `src/tui-themes.ts`（`catppuccin-community/` write-if-missing） | — |
| Y | schema 迁移 | P2 | ✅ | `src/state.ts`（`migrate`）、`docs/state-migrations.md` | — |
| EE | e2e 测试 | P2 | ✅ **路由/宿主级已实施**（`tests/e2e/update-check.e2e.spec.ts`：真 cordis + 真 HTTP + stub registry，覆盖路由 200 / channel / 缓存 / ETag 304 / 错误码 / settings namespace）；**剩余「起宿主 + 浏览器」那半已于 2026-09-21 与 FF 合并为 `EE+FF`** —— 立项材料、可行性实测数据与四个方案见 §3.9 | `tests/e2e/update-check.e2e.spec.ts` | — |
| L | palette 版本锁定 | P2 | ✅ | `scripts/generate-palettes.mjs`（`--pin <sha>` → `// UPSTREAM_PIN`） | — |
| II | glass CSS lazy | P2 | ✅ | `scripts/gen-glass-css.mjs` + `glass-css.gen.ts` + `glass-layer.ts`（enable 才挂 `<style>`） | — |
| KK | sourcemap 发布 | P3 | ✅ | `tsdown.config.ts`（`sourcemap: true`）、`package.json`（`"*.map"`） | — |
| CC | 多语言字典 | P2 | ✅ | `src/client/locales.ts`（+ja/ko/es/fr/de）、`tests/locales.spec.ts` | — |
| DD | 风味副标题 | P3 | ✅ | `src/client/locales.ts`（`flavor.<id>.subtitle`）、`CatppuccinRow.tsx` | — |
| M | shiki 子样式 | P3 | ✅ | `src/client/shiki-tokens.ts`（`[flavor][style]` 二维表）、`src/state.ts`（`shikiStyle`）、`CatppuccinRow.tsx`（选择器） | — |
| U | 错误分类 | P2 | ✅ | `src/update-check.ts`（`network.local` / `network.upstream`）、`UpdateRow.tsx` 分文案 | — |
| V | 重试退避 | P3 | ✅ | `src/client/UpdateRow.tsx`（失败 30s 后自动重试一次 + 倒计时） | — |
| W | ETag 缓存 | P3 | ✅ | `src/update-check/host.ts`（If-None-Match / 304 复用缓存） | — |
| GG | 贡献指南 | P3 | ✅ | `CONTRIBUTING.md` | — |
| HH | typedoc | P3 | ✅ | `typedoc.json` + `pnpm docs:api` → `docs/api/`（**2026-09-15 起不入库**：本地按需生成，见 WW；Pages 发布仍未做） | — |
| JJ | 主题 lazy-register | P3 | ✅ | `src/client/index.ts`（只注册当前风味，选中时按需注册） | — |
| AA | 键盘导航 | P2 | ✅ | `src/client/glass/glass-row.tsx`（segmented roving tabindex + 方向键/Home/End） | — |
| F | 主题预览缩略图 | P2 | 待启动（视觉，前置：截图流水线） | `src/client/palettes.ts`、`CatppuccinRow.tsx` | — |
| G | glass 预览 | P1 → ❌ | ❌ 不推进（2026-09-21，见正文 G 条复核结论）：前提已被 0.5.1 的设置弹窗玻璃化取代——行本身就坐在实时玻璃面板里（`glass-layer.ts:375-378` 的 `--dsh-glass-blur` / `--dsh-glass-frost` 挂在 documentElement，拖 knob 时弹窗跟着变），再加 swatch 是重复能力；brightness（改页面地面）与 mode（改布局）也无法在单张 swatch 里表达。重开条件：有人指出弹窗实时预览不够用的具体场景 | `src/client/glass/glass-row.tsx` | — |
| SS | glass 预设档位 | P1 | ✅ 已实施（`ca979ba`：清透 / 标准 / 磨砂三档，`glass-row.tsx:152-159`）——勿重做 | `src/client/glass/glass-row.tsx` | — |
| Q | layout preview | P3 | 待启动（视觉，前置：截图流水线） | `src/client/glass/glass-row.tsx` | — |
| NN | hero 空状态品牌化 | P2 | 待启动（视觉，前置：截图流水线） | `src/client/glass/glass.module.css` | — |
| PP | 会话列表选中/hover | P2 | ✅ 已实施（2026-09-18）：选中行补上真底色 `color-mix(nav-item-active 40%, transparent)`（`glass.module.css` 侧栏段）——真页实测上游 **hover 与选中本来就同是 6% tint**（`rgba(38,49,72,.06)`），只能靠 2px accent 条分辨；用 `card-hover` 试过但**隐形**（那 recipe 与地面同色，合成后逐像素不变）。**四风味实测**（注入生成物字节，A/B）：合成填充 Latte `#dbdde5` / Frappé `#2f3243` / Macchiato `#242636` / Mocha `#1e1e2b`，标题 14px `label-primary` 对比度 **5.89 / 8.29 / 10.07 / 11.38**；40% 为天花板（12px 时间戳 `label-secondary` 在 50% 时 4.41 < AA）。`tests/glass-css.spec.ts` 有 PP 断言；typecheck / typecheck:tests / 154 tests 全绿 | `src/client/glass/glass.module.css`、`tests/glass-css.spec.ts` | — |
| QQ | 背景层（壁纸/渐变） | P2 → ❌ | ❌ 不推进（2026-09-18 定案，理由见正文 QQ 条）：① issue #9 已对外关闭（「本插件定位不太适合加上自定义壁纸功能」+ 5 个社区皮肤插件可配合）；② 背景层非纯色 ⇒ `backdrop-filter` 不再是恒等变换，ZZ 在 0.5.3 删掉的 4 处 blur 与 mica 460k→236k px² 的收益全部作废；③ 会让 `tests/glass-css.spec.ts:64`「背后只有地面就不许 blur」的前提**假绿**。⇒ 架构级反悔，需单独立项 + 重测 GPU 才可再议 | `src/state.ts`、`src/client/glass/` | — |
| RR | accent 自定义 | P2 | 待启动（视觉；K 已提供等价能力，可无限期推后） | `src/state.ts`、`src/client/CatppuccinRow.tsx` | — |
| OO | compat 材质增强 | P1 | ✅ 已实施（2026-09-18）：compat 的浮动家族（`menu` / `tooltip` / `card` / `popover` / `dropdown`）补上 `--dsh-glass-card-raised` 半透明填充 + `outline` 画的 hairline rim（`outline-offset:-1px`，不动布局、不盖宿主 box-shadow，`:not(:focus-visible)` 保住焦点环）。真页 computed style A/B 实测：composer 卡 `rgb(30,30,46)` 实色 → `color(srgb … / 0.256)` + 1px rim。**有意排除 `panel`**：面板嵌套（`P3OORG_panel` 内是透明的 `P3OORG_panelBody`），两处都填会叠出宿主没要的内框（实测 `newlyFilledFromTransparent=0` 由断言锁定）。Latte 下靠 rim 显形（`layer-1` === `bg-base`，填充合成后与地面同色） | `src/client/glass/glass.module.css`、`tests/glass-css.spec.ts` | — |
| LL | 次级文字 token 提档 | P1 | ✅ 已实施（issue #7 批次：`palettes.ts:326-327` = subtext0 / overlay2，`palettes.spec.ts:197` 锁 floors）——勿重做 | `scripts/generate-palettes.mjs` | — |
| MM | 暗色 accent 提亮 | P1 | ❌ 已驳回（拿不出「官方取值在 DSH 下不成立」的证据，属审美偏好；品牌蓝已被 `palettes.spec.ts:105` 锁成契约；要更亮的蓝走 K） | `scripts/generate-palettes.mjs` | — |
| O | reduced-motion | P1 | ✅（既有 `@media (prefers-reduced-motion)`，0.5.0 前已实施） | `src/client/glass/glass.module.css` | — |
| P | 高对比度模式 | P1 → ❌ | ❌ 不推进（2026-09-18 核查，见正文 P 条）：①「强制 surface 不透明」**已存在**——`glass-row.tsx:221-229` 总开关一关即原版不透明界面，兼容模式也已「不模糊大面积区域」（`glass.modeHint`），再开一个开关是重复能力；②「文字加深」属 palette 层偏离，按规则 1 需「官方取值在 DSH 下不成立」的证据，当前 `prefers-contrast` 实测 0 处、无用户反馈。⇒ 有低视力用户反馈时只做「强制不透明 + 保留官方色」最小版 | `src/client/glass/glass-layer.ts` | — |
| Z | aria-valuetext | P1 → P3 | ✅ 已实施（零文案版 `aria-valuetext={`${value}${unit}`}`，`glass-row.tsx`）；定性档位名仅在有屏幕阅读器用户反馈时再做 | `src/client/glass/glass-row.tsx` | — |
| BB | 对比度警告 | P1 | ▲ 缓做：仅静态阈值版（glass 下半透明背景使实时对比度不可靠，误报风险 > 收益） | `src/client/glass/glass-row.tsx` | — |
| B | palettes 分文件 | P2 | ❌ 已驳回（714 行生成物，拆文件零收益 = YAGNI） | `scripts/generate-palettes.mjs` | — |
| FF | 视觉回归 | P3 | ⏳ **部分实施 + 已合并**（2026-09-21 与 EE 并成 `EE+FF`，立项见 §3.9）。**✅ 脚本**：`scripts/screenshot-previews.cjs <token>` 端到端跑通（4 风味 + hero + 恢复原偏好），四风味预览已用 0.5.4 重出（每张含 2.6~3.1 万像素的 PP 选中行填充），并修掉「截图时弹窗遮罩压暗整页」（侧栏读成 `182,183,186` 而非 `239,241,245`）。三个真因：① `page.goto` 带不上 token → 401 空白页 → `openSettings` 90s 超时（这才是长期卡点）；② 行标题 `?` 徽标让 `getByText('Catppuccin 主题', {exact:true})` 恒为 0；③ 弹窗内「跟随系统」有两处。**未做**：把截图 diff 接进 CI（待决，见 §3.9） | `scripts/screenshot-previews.cjs`、`assets/previews/` | — |
| VV | 暗色 success / warn tertiary 对比度（源自 CHANGELOG `[0.5.1]` 内联待办，此前无 ID） | P1 | ✅ 已实施（0.5.2）：900 步混向 `crust` 18%，实测 **4.96~8.30** ✅；`tests/palettes.spec.ts` 新增 `dark status tint readability (VV)` 两条断言 | `scripts/generate-palettes.mjs`、`tests/palettes.spec.ts` | — |
| TT | 覆盖编辑器值输入逐键提交（清空值即删行） | P2 | ✅ 已实施（2026-09-15，方案 a）：值输入非受控 + `onBlur`，7 语言 hint 同步；取舍见正文 TT 条 | `src/client/CatppuccinRow.tsx`、`src/client/locales.ts`（`row.overridesHint`） | — |
| UU | 测试类型检查链路断链（4 处既有类型错误） | P3 | ✅ 已实施（0.5.2）：4 处修复（未动生产签名）+ `pnpm typecheck:tests` + CI `Typecheck` 步（同时跑 src 与 tests 两套） | `tsconfig.vitest.json`、`tsconfig.json`、`vitest.config.ts`、`.github/workflows/publish.yml`、`tests/{client,reentrancy,versions}.spec.ts` | — |
| WW | `docs/api/`（typedoc 产物，89 文件 / 959 KB）曾过期：缺 `overridesSnapshot` 等新导出。**重跑实测**：typedoc 的 `origin` remote 警告是虚警（链接正确、指向当前 commit 的 permalink）；76 文件差异只是链接里的 commit SHA 变了 | P3 | ✅ 已定案（2026-09-15）：选**候选 C / B-lite**——移出版本库（`git rm -r --cached` + `.gitignore`），`pnpm docs:api` 仍可本地按需生成；不开 Pages、不加 workflow（将来需要在线文档再补 B） | `typedoc.json`、`docs/api/`、`.gitignore`、`README.md`、`README.en.md` | — |
| XX | 覆盖编辑器「+ 添加」的新行在键入值第一个字符后丢失焦点（草稿行→持久化行的转换时机） | P2 | ✅ 已实施（2026-09-18）：草稿行也改为非受控 + `onBlur` 提交，与持久化行对称。commitDraft 拆分为 commitDraftKey / commitDraftValue，输入框在打字期间保持稳定 | `src/client/CatppuccinRow.tsx`（`commitDraftKey` / `commitDraftValue`） | — |
| YY | ja / ko / es / fr / de 字典未经母语复核（2026-09-15 改动过的键：`row.overridesHint`；此前 CC/DD/J 批量新增的文案同样未复核） | P3 | **待人工**（需母语者；不是流水线能解决的问题）。**2026-09-21 已完成可自动化的那部分**（结构 + 术语 + 长度审计）：键集/空值/占位符全通过（78/78）；「与 en 逐字相同」命中项均为合法同源词（非漏翻）；**实际只有 9 条长文案需要人读**（其余 51 条短标签，估 20~30 分钟/语言）；已修 ja/ko 的「磨砂」旋钮与预设用词分裂并补两条断言。清单与具体靶子见 `docs/locale-review.md` | `src/client/locales.ts`、`docs/locale-review.md` | — |
| ZZ | issue #13：玻璃 `backdrop-filter` 的「面积成本」——地面之上的 blur 是恒等变换 | P1 | ✅ 已实施（0.5.3）：删掉 **4 处纯浪费**的 `backdrop-filter`（侧栏 `::before` / 气泡（float + compat）/ 轨迹视图，背后均为**纯色地面** ⇒ 成本全在每帧一次 backdrop 回读）；真页实测：**玻璃填充逐像素不变**（气泡隐藏内容后 0/19184），可见差异只是玻璃面上字形的重抗锯齿（侧栏 2.81% ≤16/255、气泡 15.17% ≤64/255）；面积账：mica 的可见模糊面积 460k px² → 236k px²（−49%），mica/compat 由 4.32× 降到 2.22×（剩下的最大 mica 独有面 = 顶栏 ~96k px²）+ `tests/glass-css.spec.ts` 回归锁 + 7 语言与双语 README 的性能提示。**2026-09-21 收尾**：维护者判断 **issue #13 无需复测**，所以「批次 B」（退掉顶栏自造重叠 `-95px`）**不再排期**——那 ~96k px² 是刻意保留的视觉效果（买「内容从磨砂条下穿过」），不是待偿债务；issue 的另一半建议（新增持久化开关）维持驳回。若日后有用户报「大面积模糊吃 GPU」，从 `glass.module.css` 里那段注释的入口重开 | `src/client/glass/glass.module.css`、`tests/glass-css.spec.ts`、`src/client/locales.ts`、`README.md`、`README.en.md` | — |
| AAA | 插件市场卡片背景不透明（设置对话框内的插件卡片显示为不透明深色块，未应用玻璃态） | P1 | ✅ 已实施（2026-09-18）：在 `[data-dsh-glass-settings]` 的深色/浅色两条规则中补充 `--dsw-alias-bg-layer-1` 的玻璃态重写（使用 `soft` 档位，因 layer-1 低于 layer-2/layer-3）；根因 = 插件卡片用 layer-1 token，但规则只重写了 layer-2/layer-3/module-platform | `src/client/glass/glass.module.css` (:285/:303) | — |

### 2026-09-15 复核：issue #13（玻璃 blur 的 GPU 成本）

**issue 的机制推断成立、但漏了最关键的一条**：本皮肤把页面地面强制成**纯色**（`glass.module.css` 的 body 规则 = `bg-base` 实色 + 亮度混合）。于是**凡背后只有地面的玻璃面，`backdrop-filter` 是恒等变换**——一个像素都不变，Chromium 照样提升合成层并**每帧回读** backdrop（半径 0 px 也一样，只有 `backdrop-filter:none` 才免提升）。issue 测到的「半径无效、面积有效」正是这件事的另一面。

**面积账**（据 issue 的三行表 + 代码核对）：`mica` 比 `compat` 多出来的模糊面 ≈ 侧栏 `::before`（~250k px²，后无内容）+ 顶栏（全宽，后为聊天流）+ 轨迹视图（仅打开时）+ 输入板（与 compat 的 composer card 同块，抵消）。其中**侧栏是纯浪费**，且面积约为顶栏的 3 倍 ⇒ 按 issue 的「面积 × 帧率」模型，删它应带来可观下降且**视觉零变化**（此处的「零变化」当时是推断，事后实测收窄为「玻璃填充逐像素不变、动的是字形抗锯齿」——见下「附：本机实测」）。

**第二个发现（issue 未列）**：顶栏那笔开销是**本插件自己造的**——DSH 里 header 是滚动容器**上方**的 `flex: 0 0 auto` 兄弟节点，原版不重叠；是 `glass.module.css` 的 `margin-top:-95px; padding-top:107px` 把聊天内容塞到顶栏底下。所以它是一笔「可以一次性退掉的可见效果」，而不是既成成本。

**判决**：
- issue 建议 1（文档/UI 性能提示）→ **做**（用文案替代新开关）。
- issue 建议 2（开关：高频内容区摘 blur、低频元素留）→ **部分做、不加开关**：实测方向与原文相反——气泡在两种模式下**都有** blur（issue 自己 compat <30% 里就含气泡），而 mica 多出来的是侧栏/顶栏；且气泡的 blur 本身就是恒等变换，已随批次免费删除。新增持久化开关要动 `state.ts` schema + 迁移 + 7 语言文案，**在拿到复测数字前不做**（YAGNI）。
- issue 建议 3（blur 层静态化、只在静止时重算）→ **驳回**：CSS 层不存在该能力，Chromium 只要 `backdrop-filter ≠ none` 就提升图层并每帧回读，`will-change` / `contain` 无法绕开。最接近的等价物是「去掉顶栏那层自造重叠」，已作为复测不达标时的第二手（见 `glass.module.css` 内注释）。

**验收**：`tests/glass-css.spec.ts` 锁两条不变量——地面之上的面不得有 blur、覆盖移动内容的面必须保留 blur（并核对「同一片像素不重复读」：composer 板内的卡片保持 `backdrop-filter:none`）。原定的硬验收是 **issue #13 的复测**（预测 `mica` 明显下降且观感不变；数字不动则说明「面积 × 帧率」模型不成立、改用退重叠方案）。

**2026-09-21 更新（取消复测）**：维护者判断**不必复测**，因此上述硬验收**不再执行**；模型的可信度改由**本机两轮目标实测**支撑（隔离构图里内部平整区**逐像素相同**、真页气泡隐藏内容后 **0/19184**、面积账 −49%），不再依赖报告人硬件的读数。相应地「批次 B」（退顶栏自造重叠）也不再排期。

#### 附：本机实测（2026-09-16）

「`backdrop-filter` 在纯色背景上是否真的一个像素都不变」在提交时只是推断，事后补了两轮实测：**① 隔离构图**钉住「玻璃填充」这一层，**② 真页 A/B** 钉住「用户实际看到的画面」。真页用的是本机 `dsh web`，其 `web` profile 装的仍是 **0.5.1**（这 4 处 blur 还在）⇒ 把声明注入成 `none` 就等于修复后的样子，A/B 正好是「删掉 vs 保留」。

##### ① 隔离构图（headless Chromium，纯色地面 + 半透明填充 + 圆角，A/B 只差一条 `backdrop-filter`）

| 区域 | 差异像素 | 最大差 | 说明 |
|---|---|---|---|
| 侧栏玻璃片（纯色地面，无文字） | **24 / 96000 = 0.03%** | **1/255** | 全在元素自身抗锯齿外缘（`y=0` 行与圆角弧上，坐标如 `(14,0) (224,0) (8,3)`） |
| 气泡（纯色地面，无文字） | **24 / 48000 = 0.05%** | **1/255** | 同上 |
| 内部平整区 | **0** | 0 | 精确相同——即「恒等变换」本身成立 |
| 对照组：同材质但确实盖住文字 | **42973 / 48000 = 89.53%** | **100/255** | 证明该测法能看出差异，前两行的「几乎为零」才有意义 |

##### ② 真页 A/B（本机 `dsh web`，mica / blur 2px / frost 20 / Latte）

先把环境钉死：页面收敛后同状态连拍 **3 张逐像素相同**（噪声底线 0）；全页 **0 个 canvas、0 处 `radial-gradient`**；把侧栏内容隐藏并去掉玻璃填充后露出的「背景」**98.4% 是同一个颜色**（`252,252,253`，其余是遮不掉的控件）。A/B 双向注入（`blur(...)` vs `none`，均 `!important`），控制项 = 同一次 A/B 里把地面换成高对比条纹。

> 地面为什么近白而不是 Latte 的 `#eff1f5`：用户把**亮度旋钮设成 100**（`--dsh-glass-brightness-white: 1` ⇒ 与白 100% 混合）。**注意取值来源**：0.5.0 起真源是官方 settings 文档 `~/.dsh/settings.yaml`（`catppuccin.glass.brightness: 100`、`updateChannel: beta`），旧的 `~/.dsh/catppuccin-state.json` 只是**一次性迁移源、此后不再跟踪**（它还写着 `brightness: 50`）——交接文档引用旧文件会把玻璃参数写错。地面是纯色（白）这一点不受影响，所以下面的均匀性结论成立。

| 区域 / 口径 | A/B 差异像素 | 最大差 | 对照项（条纹地面，同一次 A/B） |
|---|---|---|---|
| 侧栏（会话列表可见） | **6302 / 224256 = 2.81%** | **16/255** | **98.28%**，最大 122 |
| 侧栏（内容 `visibility:hidden`） | **674 / 224256 = 0.3%**，全在板子自身边缘与圆角 | 16/255 | — |
| 气泡 436×44（含 32 字文本） | **2910 / 19184 = 15.17%** | **64/255** | **99.22%**，最大 111 |
| 气泡（内容 `visibility:hidden`） | **0 / 19184 = 0%** | **0** | — |
| 侧栏（可见 + `blur(24px)` vs `blur(2px)`） | 2696 = 1.2%，几乎只在板子边缘/四角 | 15/255 | — |
| 侧栏（可见 + `brightness(1)` vs `none`：只提升合成层、不做任何滤镜） | 5944 = 2.65%，与第一行**同形分布** | **2/255** | — |

**结论（本轮最重要）**：真页上「删掉 blur」的差异**全部落在字形像素上，不在玻璃填充上**——
- 气泡把内容隐藏后 A/B 是 **精确 0**（19184 像素一个不差）⇒「填充 + 背景」这一层确实是恒等变换，与 ① 一致；
- 侧栏藏掉内容后只剩 **0.3%**，且只在板子自身的边缘与圆角（blur 会从板外采样：`blur(24px)` 与 `blur(2px)` 的差异也只出现在这些边角）⇒ 板内平整区**没有结构可失**；
- 剩下的 2.81%（侧栏）/ 15.17%（气泡）随内容一起出现、随内容一起消失 ⇒ 是**字形重抗锯齿**：多一层合成表面后文字的抗锯齿换档。`brightness(1)`（只提升、不变色）给出**同形分布、峰值仅 2/255**，说明分布来自合成层本身，blur 把幅度推到 16/255（气泡 64/255）。**这不是「模糊看错了背景」**：用户看到的还是同一批字，只是栅格化结果不同。

**更正交接时的一条推断**：交接文档写「本机侧栏背后那层非纯色来自第三方环境插件（`radial-gradient` 辉光）」。**本轮不成立**——同一个实例里**根本没有**环境图层（0 canvas / 0 渐变），而「清环境层前 2.81% vs 清后 2.79%」几乎相同，且 2.81% 的来源是字形而非背景。⇒「删掉在纯 DSH 下不可见」这条**成立**，但成立的理由是「字形像素之外零差异」，不是「本机装了环境插件所以才有差异」。

**未覆盖**：轨迹视图（`[data-dsh-glass-trajectory]`，需在 UI 里打开该视图）本轮仍没测到；气泡只测到 1 条会话里最大的一块（436×44，3 个气泡中最大）。

##### ③ 面积账（本机实测，顺带更正 issue 表格的两处）

口径：在真页上把视口按 **4px 栅格**铺开，凡被某个「`backdrop-filter ≠ none` 的面」覆盖的格子标 1，最后按格子数 × 16 px² 报**可见面积的并集**——不是把各面的盒子相加（相加会把嵌套盒、视口外的详情抽屉都算进来；第一版就是这么算错的）。compat 一列是把 compat 的选择器表套在同一份 DOM 上算的**模拟值**（没有真的切到 compat 模式，那会动用户的持久化设置），只能当「会命中哪些面」看。

| | 首屏（新会话） | 会话视图（有气泡） |
|---|---|---|
| mica（0.5.1）可见模糊面积 | **361,888 px² = 27.9%** 视口 | **459,760 px² = 35.5%** |
| 其中待删的侧栏 `::before` | **221,996 px²（占 61%）** | **221,996 px²（占 48%）** |
| mica 删后 | **137,632 px²（10.6%）＝ −62.0%** | **235,504 px²（18.2%）＝ −48.8%** |
| compat（模拟） | 94,000 px²（7.3%） | 106,320 px²（8.2%） |
| mica / compat | 3.85× → **1.46×** | 4.32× → **2.22×** |

会话视图里 mica 的明细（都是并集后的可见面积）：侧栏 `::before` 221,996 ｜ 输入板 slab `[data-dsh-glass-inputbar]` 97,825 ｜ **顶栏 `header` 95,880** ｜ 2× 页面边缘渐变条 18,720×2 ｜ 新会话按钮 7,676 ｜ `+` 珠 784×2 ｜ 3 个气泡合计 31,172（那 3 个在本次截图里滚到了视口外，可见时才有面积）。

**更正 issue 表格两处**（其余与代码/实测相符）：

1. **「全宽渐变条」不是 mica 独有**：两条 13px 的页面边缘渐变条挂在 `[data-dsh-glass] [data-dsh-glass-fade]`（`glass-layer.ts` 注入，随总开关一起增删），**两个模式都有**，合计 37,440 px²。
2. **`[data-composer-card]` 也不是 mica 独有**：DSH 的 composer 卡片类名是 `uV2eYG_card`，compat 的通用规则 `[data-dsh-glass-compat] [class*='card']` 一样把它糊掉（本机实测该面在 compat 下约 **76k px²**）。mica 与 compat 真正的差是**顶栏**（~96k px²）与**侧栏**（本次删掉的 ~222k px²），不是输入框。

其余核对结果：`DEFAULT_GLASS` 在 `v0.4.3` 与 `v0.5.2` **逐字相同** ✓；`glass.module.css` 在这两个 tag 之间多了 54 行，但全是设置弹窗的**填充 token**（注释明写 "no backdrop-filter here"），**没有增删任何 `backdrop-filter`** ✓ ⇒ 「升级版本不改变本现象」成立。issue 那句「气泡本身即内容，用伪元素手法绕不开」**不需要绕**：气泡背后就是纯色地面，直接删掉即可（见 ②：填充 0 像素差）。

⇒ 对本 issue 的意义：本轮删除把 mica/compat 的模糊面积比从 **4× 量级压到 1.5~2.2×**；剩下的最大 mica 独有面是**顶栏（~96k px²，占 mica 的 21%）**，而那正是「批次 B」要退掉的自造重叠（`margin-top:-95px`）——**2026-09-21：复测取消，批次 B 不再排期**，这笔开销作为刻意保留的视觉效果留在树上（见 ZZ 行与本节验收段）。

##### 方法学（两轮踩到的，别再踩）

- **噪声底线必须先等收敛**：第一次真页跑拿到 2.79%，但同状态连拍是 UNSTABLE（页面还在渲染）——那个数字与收敛后的 2.81% 凑巧接近，**仍然不能引用**。先轮询到「两张完全一致」再开始 A/B。
- **注入要显式双向**：本机装的是 0.5.1（blur 还在），所以「ON」也必须显式注入，否则测的是空气；注入后核对 `getComputedStyle(el, '::before').backdropFilter` 实际值。
- **「内容 `visibility:hidden`」是分辨「填充 vs 字形」的关键对照**：只测 ON/OFF 会把「填充/背景变了」（设计降级）与「文字重栅格化」（不是降级）混为一谈。
- **半径对照（`blur(24px)` vs `blur(2px)`）能一句话证明背景无结构**：半径放大 12 倍而板内零变化 ⇒ 背后没有可失的细节。
- （① 的旧账）**控制项必须 DIFFERS**：头两次全绿是假的，因为（a）控制项的文字是 DOM 尾部兄弟节点、画在盒子**上面**，盒子的 backdrop 仍是纯色；（b）`<script>` 写在目标元素之前、`classList.add` 空跑。**一个永远 "IDENTICAL" 的像素测法等于没测**。
- **「占用率」不能靠 trace 的「时间」自证**：试过 headful Chromium + CDP trace（`devtools.timeline,cc,gpu`）跑 6s 匀速滚动，相位 `blur 开 → 关 → 开`：composite ON 3178ms（A1 3152.8 / A2 3203.4，同配置漂移 50ms）vs OFF 3254ms——**OFF 反而略高，差异落在噪声里**；trace 里没有 `GPUTask` 事件，只有 `CommandBuffer::Flush` 这类跨帧流水线事件（≈整段时长）。负载下 rAF 未节流（6s 跑 1100+ 帧）、合成管线压满，多出的 backdrop 回读不改变关键路径 ⇒ **这台机器上量不出这笔开销**，报告人的占用率读数无法在本机复现（脚本 `gpuverify.cjs`，别原样重试）。

#### 附：issue #12 复核的两条补充（2026-09-16）

1. **白地面（`#fff`）不能当作「当时用的是官方浅色主题」的证据**：玻璃层把**亮度旋钮设到 100** 时自己就会把地面混成纯白（`--dsh-glass-brightness-white: 1` ⇒ 计算值 `color(srgb 1 1 1)`；本机实测就是 100）。真正的判据是**文字 token**——报告人给的 caption `173,178,184` / secondary `97,102,108` 与官方浅色逐通道吻合，而 Latte 下应为 `#7c7f93`(124,127,147) / `#5c5f77`(92,95,119)。「调色板没生效」这个结论只靠这两组数字成立（原来的措辞把 `#fff` 也算了进去，偏强）。
2. **被删的 `textarea::placeholder` 规则确认是死代码**：本机 DSH（0.1.5-rc.1）实测 `[data-composer-card]` 内 textarea = **0**，**整页 textarea = 0**；composer 是 contenteditable，提示是 `div[data-composer-placeholder]`（计算色 `rgb(124,127,147)` = Latte caption `#7c7f93`）⇒ 删它**不可能**改变任何人的观感，issue #12 的复测实质上只在问「他那台机器上 Latte 有没有生效」。
