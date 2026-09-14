# dsh-catppuccin 插件改进建议

> 记录日期：2026-09-05（2026-09-06 修正：按仓库当前实现复核，下文「现状修正」为与实际代码的差异）
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

**B. `palettes.ts` 单文件过大** — 优先级 **P2**
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

**D. 三个 row 缺分组头部** — 优先级 **P1**（**上游不支持分组，发起上游**）
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

**SS. `GlassRow` 缺预设档位** — 优先级 **P1**
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

**TT. 覆盖编辑器的值输入逐键提交：清空值即删行（打字中途整行消失）** — 优先级 **P2**（2026-09-13 复核新增，**待评估**）
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
- 附注：**键名**输入已在 cdccb09 改为非受控 + 失焦提交，原因是 `readOverrides()` 改为 read 侧 sanitize 后，逐键重写的中间态（`-`、`--`）会被丢弃并让整行消失；值路径对任意字符串都合法，没有同类新风险，故当时维持原设计。

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

**LL. 次级文字 token 映射过暗** — 优先级 **P1**
- 现象：暗色风味下侧边栏分组标签、会话时间戳、底部入口等次级文字对比度目测 < 3:1（实测截图可见）。根因是 `generate-palettes.mjs` 把 `--dsw-alias-label-secondary/tertiary` 映到了 Catppuccin 较暗的 overlay 层级。
- 优化方向：暗色三风味 secondary 提一档到 `subtext0`、tertiary 到 `overlay2`；Latte 同步核对。
- 实施方法：改 `scripts/generate-palettes.mjs` 的映射表后 `pnpm gen:palettes` 重生成，勿手改 `palettes.ts`。
- 预期效果：弱光环境可扫读，WCAG AA 达标；与 BB（运行时对比度警告）互补——本条从源头修，BB 做兜底。

**MM. 暗色下主 accent 可读性不足** — 优先级 **P1**
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

**P. Glass 缺高对比度模式** — 优先级 **P1**
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

**RR. 缺每风味 accent 自定义** — 优先级 **P2**
- 现象：accent 固定跟随风味（Mocha 只能 blue 系），用户想"Mocha 底 + mauve 点缀"做不到。
- 优化方向：开放 Catppuccin 官方 14 色（mauve/pink/teal…）做 accent 覆盖，重映射 `--dsw-alias-brand-*` 一族。
- 实施方法：`CatppuccinState` 加 `accentOverride` 字段；CatppuccinRow 加色板选择器。与 K（任意 token KV 覆盖）是父子关系——本条是 80% 用户想要的简化入口，K 服务 power user。
- 预期效果：个性化卖点，与官方主题系统差异化。

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

**Z. slider 缺 aria-valuetext** — 优先级 **P1**
- 现象：GlassRow 的 Knob 用了 `<input type="range">`，但 `aria-valuenow` 是数字，对"50%"这种语义屏幕阅读器读不出"中等磨砂"。
- 优化方向：locale 增加 `glass.frost.valueText(50)` 返回"中等磨砂"；`Knob` 组件绑 `aria-valuetext`。
- 实施方法：纯属性扩展。
- 预期效果：屏幕阅读器用户能听懂每个 knob。

**AA. 键盘导航覆盖** — 优先级 **P2**
- 现象：CatppuccinRow 按钮可用 Tab + Space/Enter；但 GlassRow 的 segmented + slider 用方向键调节的体验没验证。
- 优化方向：slider 加 `onKeyDown` 处理 Arrow/Home/End；segmented 加 roving tabindex。
- 实施方法：WAI-ARIA Authoring Practices 标准做法。
- 预期效果：键盘可达性达到 AAA。

**BB. GlassRow 颜色对比警告** — 优先级 **P1**
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

**EE. 缺 e2e 测试** — 优先级 **P2**
- 现象：tests/ 下全是 vitest 单测，没有真实 plugin 启动验证。
- 优化方向：用 `@deepseek-ai/dsh` 测试 profile 起一个最小 web，加载插件，断言 4 个主题已注册、玻璃开关可切换、update-check 路由返回 200。
- 实施方法：扩 `tests/e2e/` 用 supertest + 真 cordis 启动。
- 预期效果：发布前回归保护。

**FF. 缺视觉回归** — 优先级 **P3**
- 现象：`assets/previews/` 有手动截图，但没在 CI 里跑对比。
- 优化方向：用 Playwright screenshot + pixelmatch，diff > 阈值即 fail。
- 实施方法：`pnpm test:visual` 接 Playwright；baseline 存 git LFS。
- 预期效果：CSS 改动不会悄悄毁预览。

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

> 状态图例：✅ 已实施（2026-09-06 第二批）｜▲ 上游阻塞 ｜ 待启动

| ID | 项 | 优先级 | 状态 | 关联文件 | 关联 PR |
|---|---|---|---|---|---|
| C | 持久化读侧一致性（写侧已由 seam 覆盖） | P1 | ✅ | `src/client/state-sync.ts`、`src/client/index.ts` | — |
| X | 多 tab 读写一致性（与 C 合并实施） | P2 | ✅ | `src/client/state-sync.ts`、`src/client/UpdateRow.tsx`（conflict 横幅） | — |
| N | seam stamper 防抖 | P1 | ✅ | `src/client/glass/glass-seams.ts`（rAF 合批 + dirty 跳过） | — |
| H | auto-check 开关 | P2 | ✅ | `src/state.ts`、`src/client/UpdateRow.tsx`（启动 + 每 6h） | — |
| I | prerelease 选择 | P2 | ✅ | `src/state.ts`、`src/client/UpdateRow.tsx`、`src/update-check.ts`（selectNewest 三态）、`src/update-check/host.ts`（per-channel 缓存） | — |
| J | tooltip/帮助图标 | P3 | ✅ | `src/client/{CatppuccinRow,UpdateRow}.tsx`、`glass/glass-row.tsx`、`src/client/locales.ts`（原生 title 落地，上游无 API） | — |
| E | 按钮 wrap | P1 | ✅ | `src/client/CatppuccinRow.tsx`（既有实现，确认关闭） | — |
| D | row 分组 | P1 | ▲ | 上游 `settings.general.item` 无 group/label 支持，发起 `@deepseek-ai/dsh-web-ui` 上游请求 | — |
| A | host half 拆分 | P2 | ✅ | `src/update-check/host.ts`（路由/缓存/etag/channel 迁出，index.ts ≤120 行） | — |
| K | token 覆盖 | P2 | ✅ | `src/state.ts`（`overrides`）、`src/client/CatppuccinRow.tsx`（折叠 KV 编辑器）、懒注册时合并 | — |
| R | TUI 自定义保护 | P2 | ✅ | `src/tui-themes.ts`（`onConflict` 默认 backup → `.bak`） | — |
| S | dry-run | P3 | ✅ | `src/tui-themes.ts`（`dryRun` 返回 planned writes） | — |
| T | 社区主题 | P3 | ✅ | `src/tui-themes.ts`（`catppuccin-community/` write-if-missing） | — |
| Y | schema 迁移 | P2 | ✅ | `src/state.ts`（`migrate`）、`docs/state-migrations.md` | — |
| EE | e2e 测试 | P2 | ✅ | `tests/e2e/update-check.e2e.spec.ts`（真 cordis + 真 HTTP + stub 服务） | — |
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
| HH | typedoc | P3 | ✅ | `typedoc.json` + `pnpm docs:api` → `docs/api/`（GitHub Pages 发布留给 maintainer） | — |
| JJ | 主题 lazy-register | P3 | ✅ | `src/client/index.ts`（只注册当前风味，选中时按需注册） | — |
| AA | 键盘导航 | P2 | ✅ | `src/client/glass/glass-row.tsx`（segmented roving tabindex + 方向键/Home/End） | — |
| F | 主题预览缩略图 | P2 | 待启动（视觉） | `src/client/palettes.ts`、`CatppuccinRow.tsx` | — |
| G | glass 预览 | P1 | 待启动（视觉） | `src/client/glass/glass-row.tsx` | — |
| SS | glass 预设档位 | P1 | 待启动（视觉） | `src/client/glass/glass-row.tsx` | — |
| Q | layout preview | P3 | 待启动（视觉） | `src/client/glass/glass-row.tsx` | — |
| NN | hero 空状态品牌化 | P2 | 待启动（视觉） | `src/client/glass/glass.module.css` | — |
| PP | 会话列表选中/hover | P2 | 待启动（视觉） | `src/client/glass/glass.module.css` | — |
| QQ | 背景层（壁纸/渐变） | P2 | 待启动（视觉） | `src/state.ts`、`src/client/glass/` | — |
| RR | accent 自定义 | P2 | 待启动（视觉） | `src/state.ts`、`src/client/CatppuccinRow.tsx` | — |
| OO | compat 材质增强 | P1 | 待启动（视觉） | `src/client/glass/glass.module.css` | — |
| LL | 次级文字 token 提档 | P1 | 待启动（视觉，需截图） | `scripts/generate-palettes.mjs` | — |
| MM | 暗色 accent 提亮 | P1 | 待启动（视觉，需截图） | `scripts/generate-palettes.mjs` | — |
| O | reduced-motion | P1 | ✅（既有 `@media (prefers-reduced-motion)`，0.5.0 前已实施） | `src/client/glass/glass.module.css` | — |
| P | 高对比度模式 | P1 | 待启动（视觉） | `src/client/glass/glass-layer.ts` | — |
| Z | aria-valuetext | P1 | 待启动 | `src/client/glass/glass-row.tsx` | — |
| BB | 对比度警告 | P1 | 待启动 | `src/client/glass/glass-row.tsx` | — |
| B | palettes 分文件 | P2 | 待启动 | `scripts/generate-palettes.mjs` | — |
| FF | 视觉回归 | P3 | 待启动（CI） | CI | — |
| TT | 覆盖编辑器值输入逐键提交（清空值即删行） | P2 | 待评估（2026-09-13 复核） | `src/client/CatppuccinRow.tsx`、`src/client/locales.ts`（`row.overridesHint`） | — |
| UU | 测试类型检查链路断链（4 处既有类型错误） | P3 | 待评估（2026-09-13 复核） | `tsconfig.vitest.json`、`tsconfig.json`、`vitest.config.ts`、`.github/workflows/publish.yml`、`tests/{client,reentrancy,versions}.spec.ts` | — |
