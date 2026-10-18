# issue #27 — 设置项从「通用设置」收敛到独立分区

> 状态：**已实施**（2026-10-17，提交 `00fce96`；随 `0.6.3-beta.3` 发到 beta 渠道，Publish run `39109687611`）。
> 取证环境：本机 `@deepseek-ai/dsh` 0.2.0-rc.2 / 0.2.1-rc.2（`%APPDATA%\DSH\data\versions`）、
> 旧版 tarball `dsh-client-ui-settings-general@0.1.5-rc.3` / `0.1.7-rc.1`（`.cache/issue27/`）、
> 官方桌面壳 `D:\PROGRAM\DeepSeek Harness\resources\app.asar`、参考插件 `@michengai/dsh-skills-manager@1.2.3`。

**术语（本文件内固定含义）**

| 词 | 指什么 |
|---|---|
| **上游** | **DeepSeek Harness 官方**（`github.com/deepseek-ai/deepseek-harness`）：`packages/client/ui-*` 各包 + 官方桌面壳 `apps/desktop`。本文所有"上游如何如何"都指它 |
| 宿主 / host | 实际跑插件的那个 DSH 进程——官方桌面壳、`dsh web`（web profile），或第三方启动器（DSH-X）；不一定等于"官方" |
| 「官方色板」 | **Catppuccin 项目**的 `palette` v1.8.0（取色来源），与 DSH 官方是两回事（`AGENTS.md`「两层官方不要混淆」） |
| 参考插件 skills-manager | **第三方社区**插件 `@michengai/dsh-skills-manager`，只作做法参照，不是上游 |


## 0. 结论（TL;DR）

| 项 | 决定 |
|---|---|
| 落点 | 注册 **`settings.section`**：导航项「**Catppuccin**」（`order 25`，官方节之后）+ 页内标题「**Catppuccin 外观设置**」 |
| 现状处理 | **删除** 4 条 `settings.general.item` 注册（不是"再加一个"） |
| 控件 | 开关 / 分段 / 按钮改用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Switch`、`SegmentedControl`、`Button`；风味选择按官方 **theme cube** 规格重绘；滑块保留 `range` 但**右侧数值改为可手动输入的输入框**（上游无 slider 原语） |
| 保留 | 插件详情页 `plugins.bundle.config` 卡片（第二个入口，不动） |
| 兼容 | `settings.section` 自 **0.1.5-rc.3** 起即存在，**不需要**降级回退；但设置页消费的 primitives `SegmentedControl` 直到 **0.1.7-alpha.1** 才有 ⇒ 实际下限 = `0.1.7-rc.1`（`engines.dsh` / `dsh.compatibility.dsh` 已同步抬到此值，见 2026-10-18 的兼容收口） |
| 版本口径 | **已随 `0.6.3-beta.3` 预发布（2026-10-18，Publish run `39109687611`）**；稳定版等实测后转正 |

---

## 1. 报告内容

issue #27（`TWFU-wcy`，2026-10-16，OPEN，无评论）：

> 主题相关设置（配色切换、代码高亮风格、自定义覆盖、玻璃质感）目前是直接插在「通用设置」页里，
> 和官方原生设置项（网页链接打开方式、繁忙时发送行为等）平铺混排。

三条具体问题：

1. **视觉割裂** —— 配色卡片、分段控件、滑块都是插件自绘，和 DSH 原生设置控件风格不一致，"一眼看出是两套 UI"。
2. **层级混乱** —— 插件功能块没有独立分区或页签，通用设置页越拉越长。
3. **可发现性差** —— 调主题要先翻进「通用设置」再往下找，不像内置插件那样有独立入口。

诉求：**收敛到自己的分区/页签** + **控件样式接入 DSH 官方设计令牌**；并点名参考 `skills-manager`。

---

## 2. 现状取证

### 2.1 我们现在注册了什么

`src/client/index.ts`（四处，全部落在 General 段）：

| 行 | 槽位 | id | order | 组件 |
|---|---|---|---|---|
| 903 | `settings.general.item` | `catppuccin` | 20 | `CatppuccinRow` |
| 923 | `settings.general.item` | `catppuccin-glass` | 21 | `GlassRow` |
| 981 | `settings.general.item` | `catppuccin-update` | 22 | `UpdateRow` |
| 994 | `settings.general.item` | `catppuccin-links` | 23 | `LinksRow` |

第四处 `plugins.bundle.config`（L1012–1030，插件详情页卡片，`detail-card.tsx`）**是另一个面，不在本 issue 范围**。

### 2.2 「两套 UI」是可量化的，不是观感

| 控件 | 我们现在 | 官方（同场景） | 证据 |
|---|---|---|---|
| 风味选择 | 自绘按钮：`6px 12px`、`border-radius 8`、`1px solid var(--dsw-alias-border-l1/l3)`、选中 `interactive-bg-active` | theme cube：`.5px solid var(--dsw-alias-border-l4)`、`var(--dsw-radius-xl)`、`flex: 180px`、`padding 20px 32px`、选中 `bg-module-platform` + `static-neutral-bluish-400` | `dsh-client-ui-theme/lib/client.js` 的 `AppearanceRow.module.css` 原文 |
| 分段控件 | 自绘 `Segmented`：26px 高、`aria-pressed`、1px 外框 | `SegmentedControl`：轨道 `interactive-bg-hover`、28px 段、滑动指示器 `bg-layer-1` + `elevation-soft`、方向键漫游 | `dsh-client-ui-primitives/lib/SegmentedControl.module.css` |
| 开关 | 自绘 44×24 玻璃胶囊 + 勾号（`GlassRow.module.css` `.toggle/.toggleOn`） | `Switch`：36×20、`aria-checked`、轨道 `border-l3` / 开 `brand-primary` | `dsh-client-ui-primitives/lib/Switch.module.css` |
| 滑块 | `range` + 玻璃风轨道/柔光 | **上游没有 slider 原语**（全仓 `type="range"` 只出现在 `dsh-api-remotes`）；官方数值控件是 stepper（`FontSizeRow`） | grep + `FontSizeRow` 实现 |
| 行节奏 | `padding 16px 0` + `1px solid border-l2` | `padding 16px 0` + `.5px solid border-l2`（仅发线粗细不同） | `ui-settings-general` / `ui-theme` 的 row CSS |

结论：**颜色基本已经走 token，割裂来自几何（尺寸/圆角/描边粗细）与控制件身份**。这决定了改法不是重做一套皮，而是"换成官方件 + 对齐几何"。

### 2.3 上游能力：`settings.section` 就是为这件事准备的

`dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`：

> One settings page per list entry. Registrant options carry the nav identity: `id` (section key),
> `order` (nav position), `label` (registrant-localized display text — the registrant re-registers
> with fresh text on locale change)… Sections render inside the panel content column.

- 导航行由 `dsh-client-ui-settings-general` 现算：`ctx.slots.entries('settings.section')` → `{id, order, label: resolveSlotLabel(...)}` → `sort(order)`；`label` 支持 **thunk**（每次读取重算，跟随语言切换）。
- 现有节位次：`account -10` / `general 0` / `models 10` / `plugins 15` / `agent-presets 20`。
- 内容列：`.options { padding: 0 24px 24px; overflow-y: auto }`；General 段自己只是 `display:flex; flex-direction:column`，并去掉最后一行下边线。
- 导航图标：**上游按 section id 硬编码**（account/models/agent-presets/plugins/archived-sessions），未知 id 回落齿轮 —— 第三方无法指定图标（参考插件传的 `icon` 字段被忽略）。

### 2.4 版本兼容（决定要不要写回退）

| 版本 | `settings.section` | label thunk | `dsh-client-ui-primitives` 在模块表 |
|---|---|---|---|
| `0.1.5-rc.3`（兼容下限） | 有（bundle 内 7 处） | 有（`resolveSlotLabel`：`typeof label === 'function' ? label() : label`） | 有（同包 `require("@deepseek-ai/dsh-client-ui-primitives")`） |
| `0.1.7-rc.1` | 有 | 有 | 有 |
| `0.2.0-rc.2` / `0.2.1-rc.2` | 有 | 有 | 有（`app.asar` 模块表：`"@deepseek-ai/dsh-client-ui-primitives":zU`） |

⇒ **不需要双注册回退**（"新宿主用 section、旧宿主用 general 行"）。旧宿主同样有该槽位，双注册只会造成重复入口。

### 2.5 参考插件实测（`skills-manager`）

issue 点名的 "skills-manager v1.1.22" 在 npm 上没有精确版本（同名 fork 多个）。取最接近的 `@michengai/dsh-skills-manager@1.2.3` 实测：

```js
slots.inject("settings.section", () => slots.register({
  name: "settings.section", id: "skills-manager", order: 25,
  label: () => locale.bind(NS)("title"), icon: "skill", locale: NS,
}, Page))
```

- **只注册 `settings.section`，零 `settings.general.item`** —— 与我们的目标结构一致；
- 开关是**照抄**官方 Switch 的 CSS（`dssm-enable-switch`，36×20），而不是 import 原语 —— 说明两条路都有第三方先例（见 §9 决策 1）。

---

## 3. 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 独立设置页**（`settings.section`） | 一个「Catppuccin」导航项，页内四块 | 直击三条诉求；上游契约就是为此设计；旧宿主也支持 | 导航图标只能吃齿轮；多一次点击 | **采用** |
| B. 插件设置页签（`settings.plugins.tab`） | 挂在「插件」设置节下的 tab | 语义上属"插件配置" | 仍要先进「插件」节（可发现性只解决一半）；该槽位由插件清单节声明，耦合更强 | 否 |
| C. 原地换控件 | 不动位置，只对齐视觉 | 改动最小 | 层级/可发现性两条完全没解 | 否（但 §5.3 的控件工作照做） |

**为什么不是 C 的折中（General 留一行"快捷入口"）**：上游没给 section 注册者导航 API（`openSection` 只在 onboarding owner props 上），行里的按钮无法跳到我们的页；留一行只能做静态说明，反而多一层噪音。

---

## 4. 目标结构

```
设置（Dialog）
├─ 导航：账户 / 常规 / 模型 / 插件 / Agent 预设 / Catppuccin ←新增，order 25（官方节之后）
└─ 内容：Catppuccin 页
   ├─ h2「Catppuccin 外观设置」   ← 官方页标题规格 16px/24px · 500
   ├─ Catppuccin 主题      （四风味方块 + 语法高亮风格 + 「自定义 token 覆盖」折叠区）
   ├─ 玻璃质感            （总开关 / 模式 / 预设 / 三个滑块 / 光斑开关 / 重置）
   ├─ 检查更新            （版本、渠道、检查按钮、自动检查开关）
   └─ 反馈与支持          （Issue / Star 链接）
```

**导航文案为什么是「Catppuccin」而不是全名**：导航项可用宽度实测 = **112px**
（`nav 188 − 左右 padding 24 − cell padding 28 − 图标 16 − gap 8`），14px 字号下
`Catppuccin 外观设置` = **134.6px**（会被 `text-overflow: ellipsis` 截成"Catppuccin 外观设…"），
`Catppuccin 外观` = 106.6px、`Catppuccin` = 74px。所以全名放在页内标题，导航只留品牌名。

- 页标题用官方规格（`ui-settings-models` 的 `h2`：16px / 24px / 500 / `label-primary`），不是自创样式。
- 行与行沿用 `16px 0` 内距 + `.5px` 发线；容器内 `> :last-child { border-bottom: none }`。
- 插件详情页卡片（`plugins.bundle.config`）保留，渲染**同一组行组件**，视觉自动同步。

---

## 5. 修改清单

### 5.1 注册层 —— `src/client/index.ts`

1. 删除四处 `ctx.slots.inject('settings.general.item', …)`（含各自的 `tolerantRegistration` 包装）。
2. 新增**一处**：

```ts
// 独立设置页（issue #27）：一个导航项，页内是我们的四块设置。
// label 用 thunk —— 外壳按读取时求值，语言切换不需要重新注册。
const t = ctx.locale.bind(NS)
ctx.slots.inject('settings.section', () => tolerantRegistration(() => ctx.slots.register({
  name: 'settings.section',
  id: 'catppuccin',
  order: 25,               // 官方节之后（account -10 / general 0 / models 10 / plugins 15 / agent-presets 20）
  label: () => t('nav.title'),
  locale: NS,
  inject: sectionInjected,   // = { flavor, glass, update } 三个既有 face
}, CatppuccinSettingsSection)))
```

- 必须继续走 `tolerantRegistration`（AGENTS.md 规则 5：apply 同步路径上的外部注册表）。重复安装时同 id 会抛 `list slot "settings.section" already has an entry with id "catppuccin"` → 静默跳过。
- `inject` 复用 `injected()` / `glassInjected()` / `updateInjected()`，**不新造数据面**。

### 5.2 页面组件 —— 新文件 `src/client/settings-section.tsx`

- `CatppuccinSettingsSection({ t, close, flavor, glass, update })`：容器（`data-catppuccin-settings`）+ `h2` 页标题（`t('page.title')`）+ 四个既有行组件，顺序同 §4。
- 页标题样式照 `ui-settings-models` 的 `title`：`font-size:16px; line-height:24px; font-weight:500; color:var(--dsw-alias-label-primary)`，上下留 `16px 0 0`，与首行 `16px 0` 内距衔接。
- 类型：`PropsRuntime<'settings.section'> & PropsLocale<'catppuccin'> & CatppuccinSettingsSectionInjected`；`SlotMap['settings.section']` 已由 `dsh-client-ui-settings/client` 提供，**不需要**手写 module augmentation（与 `plugins.bundle.config` 的情形不同）。
- 容器样式放 `settings-section.module.css`：`display:flex; flex-direction:column` + 去尾行发线。
- `detail-card.tsx` 保持原样（组合相同，**不加** h2——插件详情页自己有标题），只更新注释里"General 段"的措辞。

### 5.3 控件对齐（四个行组件）

| 文件 | 现状 | 改法 |
|---|---|---|
| `CatppuccinRow.tsx` | 自绘按钮 + 自绘 `Segmented` + 内联样式 | 风味块改官方 theme cube 规格（新建 `CatppuccinRow.module.css`，几何/描边/选中态照抄 `AppearanceRow`）；语法高亮风格改 `SegmentedControl`；`?` 帮助保留（官方无对应 atom），可选换 `Tooltip` |
| `glass/glass-row.tsx` + `GlassRow.module.css` | 玻璃胶囊开关 44×24；自绘 `Segmented`；预设也是 `Segmented` | 总开关 / 光斑开关 → `Switch`；模式（mica/compat）→ `SegmentedControl`；预设 → 三个 `Button size="sm"`（选中 `primary`，其余 `outline`）——**不能用 SegmentedControl**：自定义态下 `value` 不在 options 里，指示器 index = -1 会被推到轨道外、且没有 tab stop |
| `UpdateRow.tsx` | 自绘开关 + 渠道按钮组 + 内联按钮 | 自动检查 → `Switch`；渠道 → `SegmentedControl`；检查按钮 → `Button size="sm" variant="outline"` |
| `LinksRow.tsx` | 两个 `<a>` | 保留（链接无官方 atom），只把颜色对齐 `--dsw-alias-*` |
| 滑块（`Knob`） | `range` + 只读数字 | **滑块 + 可编辑数字框**（见下）：`range` 按 token 重绘（轨道 `bg-layer-3`、已选段 `brand-primary`、滑块 `bg-layer-1` + `elevation-soft`，去掉硬编码白/黑阴影）；右侧 `52×28` 数字框走官方输入件规格（`.5px border-l3`、`radius-sm`、聚焦环 `brand-primary`），单位 `px` / `%` 独立成 span。注释写明"上游无 slider 原语，数字框是可输入变体" |

**滑块 + 数字框的交互契约**（`glass-row.tsx` 的 `Knob`）：

| 行为 | 规格 |
|---|---|
| 拖动滑块 | 数字**实时**跟随；沿用现有 setter + 防抖持久化 |
| 输入数字 | `type="text"` + `inputMode="decimal"`（**不用** `type=number`：原生上下箭头与本行冲突，且无法统一隐藏） |
| 生效时机 | **Enter 或 blur**；中途不写（避免每键一次重注册主题，`CatppuccinRow` 的 item TT 已经踩过这个坑） |
| 越界 | 自动夹到该轴区间（blur 0–40、frost 0–100、brightness 深色 0–50 / 浅色 50–100） |
| 非法/空值 | 回退到当前值（不写、不骂人） |
| 步长 | 键入值按步长归一（blur 0.5、frost 1、brightness 1）；`↑`/`↓` 键按同一档步进 |
| Esc | 丢弃草稿、回退当前值（与仓库既有"输入失焦才提交"的习惯一致） |
| a11y | 输入框 `aria-label` 取该轴名（复用 `t('glass.blur')` 等），单位不进 accessible name |

**不使用 `SettingsForm` 原语**：它是"暂存草稿 + 保存才写"的表单壳（`SettingsFormProps.onSave/onDiscard`），而本插件的玻璃/配色是**实时预览**语义（改一下立刻看到）。强行套用会改变行为，属规则 4 之外的产品倒退。

**依赖**：新增 `devDependencies["@deepseek-ai/dsh-client-ui-primitives"] = "0.2.0-rc.2"`（解包 937 KB、无运行时依赖）。
已定（2026-10-17）：走 import 路线，不照抄 CSS。
构建侧无需改：`web-platform.ts` 的 `PLATFORM_MODULES` 已含该 specifier，`tsdown.client.ts` 的 `CLIENT_EXTERNALS` 会把 `require("@deepseek-ai/dsh-client-ui-primitives")` 留给宿主模块表。

### 5.4 i18n —— `src/client/locales.ts`

新增 **2 个键**（七个字典同值/同义；`locales.spec.ts` 会强制键集一致）：

| 键 | 用途 | zh | en | ja | ko | es | fr | de |
|---|---|---|---|---|---|---|---|---|
| `nav.title` | 导航项 | Catppuccin | Catppuccin | Catppuccin | Catppuccin | Catppuccin | Catppuccin | Catppuccin |
| `page.title` | 页内标题 | Catppuccin 外观设置 | Catppuccin appearance | Catppuccin 外観設定 | Catppuccin 모양 설정 | Aspecto de Catppuccin | Apparence Catppuccin | Catppuccin-Darstellung |

- 现有 `row.*` / `glass.*` / `update.*` / `links.*` 文案全部复用，不改。
- **可选（P3）**：页面已有 h2「Catppuccin 外观设置」后，首行标题 `row.title`（现为「Catppuccin 主题」）可收成「配色」，
  避免同屏两次出现 Catppuccin；这会动七个字典的一行，属文案微调，可并入 P3。

### 5.5 玻璃层

- `glass-seams.ts` 的 `data-dsh-glass-settings`（`:has(> [role="dialog"][aria-modal="true"])`）继续命中同一个设置弹窗，**无需改动**。
- 新页里所有面仍走 `--dsw-*` / `--dsh-glass-*` token；按规则 4 推论一，页内不加 `backdrop-filter`（页背后是设置弹窗自身材质，不是"只有地面"）。
- 官方 `Switch` / `SegmentedControl` 在玻璃模式下自动吃 `[data-dsh-glass-settings]` 的半透明 token 重映射，不需要额外覆写。

### 5.6 测试

| 文件 | 改动 |
|---|---|
| `tests/reentrancy.spec.ts` | L395 / L426 的 `settings.general.item === 4` 改为：`settings.section` 恰 1 条（断言 `id/order/label/locale`）+ `settings.general.item` **0 条**（回归锁）；`plugins.bundle.config` 断言保持 |
| `tests/rows.spec.tsx` | `getByRole('switch', { name })` 仍然成立（官方 Switch 同角色）；`SegmentedControl` 是 `role="tab"` 不是 button，相关断言改 `getByRole('tab', { name })`；补充"预设按钮组"断言；**新增数字框用例**：键入越界值→夹紧、非法/空值→回退、Enter 提交、Esc/失焦回退、↑↓ 步进、拖动后数字同步 |
| `tests/settings-section.spec.tsx`（新） | 渲染冒烟：四块齐全、`close` 可调用、无重复 id |
| `tests/locales.spec.ts` | 自动覆盖 `nav.title`（键集比对），无需改 |
| `vitest.config.ts` | 若 jsdom 下外部化 primitives 报 CSS 解析错，加 `test.server.deps.inline: [/@deepseek-ai\/dsh-client-ui-primitives/]`（否则不需要） |

### 5.7 文档

- `README.md` / `README.en.md`：`设置 → 常规 → 外观下方一行` → `设置 → Catppuccin`；三处"设置 → 常规"路径（zh L55/196/215/237，en L59/224/246/268/429）；保留"另一处入口 = 插件详情页"的说明。
- `CHANGELOG.md`：`[Unreleased]` 记一条 **变更**（设置入口迁移）+ 一条 **修复**（issue #27）。
- `docs/plugin-improvements.md`：`D（行分组）` 的旧结论「不推进」标注**已被 issue #27 取代**（当时缺的是 General 的分组 API，现在有 `settings.section`）。
- `AGENTS.md`：在「项目定位」的判定先例里补一行（设置面 = `settings.section`，General 只放"一行一个偏好"）。

---

## 6. 实施步骤

| 阶段 | 内容 | 可独立验收 |
|---|---|---|
| **P1 注册搬迁** | 5.1 + 5.2 + `nav.title` / `page.title` + reentrancy 测试 | 设置里出现 Catppuccin 页；通用页再无我们的行；功能与改前等价 |
| **P2 控件对齐** | 5.3 四个行组件 + primitives 依赖 + rows/section 测试 | 开关/分段/按钮与官方同形；风味方块与 Appearance 的 cube 同规格 |
| **P3 文案与文档** | 5.7 | README 路径正确；CHANGELOG 有记录 |
| **P4 兼容与验收** | §8 全量 | 双宿主 × 四风味 × 玻璃开关截图矩阵通过 |

建议 **P1 单独一个 commit**（可回滚的最小单元），P2 再一个。P1 之后即可真机验证"入口"这件事是否被报告人认可，避免控件返工白做。

**发版**：**暂不发版**。维护者手上有几处改动要先做完，本方案（P1+P2）落地后留在工作树/分支里，
等那批改动一起走 `0.6.3-beta.x` 测试版；到时再把 P3 文档与 CHANGELOG 一起补。

---

## 7. 风险与对策

| 风险 | 影响 | 概率 | 对策 |
|---|---|---|---|
| 旧宿主不声明 `settings.section` | 设置入口整体消失 | 极低（0.1.5-rc.3 起已有，已取证） | 不加回退；CI `boot-e2e` + 真机 0.2.0/0.2.1 双跑 |
| 宿主模块表没有 primitives | `require` 抛错 → entry 崩 → 官方壳关停全部插件 | 极低 | 兼容下限包内该包就是 external（已取证）；构建 purity gate 会拦；boot-e2e 覆盖 |
| vitest/jsdom 加载 primitives（CSS import）失败 | 单测红 | 中 | `test.server.deps.inline`；仍失败则 `vi.mock` 掉 primitives |
| `SegmentedControl` 是 tablist 语义但没有 panel | a11y 轻微不准确 | 低 | 官方 Models 页把同一组件当纯模式选择器（有先例）；必要时补 `aria-label` 说明 |
| 删掉 General 行改变用户习惯 | 用户"找不到设置" | 中 | 导航第二项 + CHANGELOG/README 明示；issue 回帖附路径 |
| 双入口（设置页 + 插件详情卡）重复 | 认知负担 | 低 | 保留（详情卡是官方插件页约定）；两处读写同一份文档，文案已说明 |
| 本机 `node_modules` 是 deref 过的链接树，装新依赖可能扰动 | 本地构建/测试失败 | 中 | 先备份 lockfile；安装后跑一次四连；以 CI 为准（CI 干净环境无此病） |
| 导航位次 5 与其他插件撞号 | 顺序抖动 | 低 | 同 order 按注册顺序，结果稳定；位次可一改即调 |
| 官方 cube `flex:180px` 在 560px 内容列里只能两列 | 版面变高 | 低 | 保留风味副标题的情况下 2×2 是预期；若嫌高可降为单行 label |

---

## 8. 验证方式

### 8.1 静态与单元

```bash
pnpm typecheck && pnpm typecheck:tests && pnpm build
npx vitest run --no-file-parallelism     # 本机必须；CI 用默认并行
```

- 断言：`settings.section` 1 条（`id=catppuccin`、`order=5`、`label` 是函数、`locale=catppuccin`）；
  `settings.general.item` 0 条；`plugins.bundle.config` 1 条且 key = 包名。
- 变异检查（延续 `mutations*.mjs` 习惯）：
  - 去掉 `tolerantRegistration` → 重复 id 用例必须红；
  - 把 `label` 改成字符串 → 语言切换用例必须红；
  - 把 `order` 改成 `undefined` → 位次断言必须红；
  - 把注册改回 `settings.general.item` → 回归锁必须红。

### 8.2 打包产物

- `lib/client.js` 中出现 `require("@deepseek-ai/dsh-client-ui-primitives")`（未被内联）。
- `pnpm build` 不触发 purity gate 报错。

### 8.3 真机（复用 `.debug/ui-adapt/` 复现台 + CDP）

| 检查 | 通过标准 |
|---|---|
| 导航 | 「Catppuccin」出现在常规与模型之间；图标为齿轮（上游限制，可接受） |
| 通用设置 | 不再出现 Catppuccin / 玻璃 / 更新 / 反馈四行；页面明显变短 |
| 页内功能 | 四风味切换即时生效；玻璃开关与三个滑块实时预览；更新检查可跑；链接可点 |
| 视觉对齐 | 计算样式对比官方 General 行：`padding 16px 0`、`border-bottom .5px`、标题 `14/22`、说明 `12/18`；开关 `36×20`；分段段高 `28px` |
| 语言 | 切 en → ja → zh，导航 label 当场更新（不重开面板） |
| 键盘 | Tab 到开关空格切换；`SegmentedControl` 左右键漫游；焦点环可见 |
| 玻璃 | 四风味 × 玻璃开/关 × mica/compat 截图矩阵；页内无 `backdrop-filter` 新增 |
| 兼容 | 0.2.0-rc.2 与 0.2.1-rc.2 各跑一次 boot（`web boot: N entry(s) did not activate` 不得出现） |

### 8.4 回归

- 插件详情页卡片仍渲染同一组行（视觉随 P2 同步变化）。
- 持久化不动：改设置 → 重启宿主 → 值保留（`configForms` / localStorage 双写路径不变）。

---

## 9. 待维护者拍板

1. ~~**依赖取向**~~ **已定（2026-10-17）**：**import 官方 `primitives`**
   （`Switch` / `SegmentedControl` / `Button`，`devDependencies` 加 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2`）。
   风味方块与滑块没有对应 atom，仍按官方 token 自绘。
2. ~~**导航位次**~~ **已定（2026-10-17）**：**按官方编号约定 → `order: 25`**（末尾）
   —— 账户 / 常规 / 模型 / 插件 / Agent 预设 / **Catppuccin**。见 §9.1。
3. ~~**滑块**~~ **已定（2026-10-17）**：**滑块 + 右侧数字可手动输入**（A′）。
   交互契约见 §5.3 表，对比图 `.debug/issue-27/compare-sliders.png`（本机文件，不入库）。
4. ~~**版本口径**~~ **已定（2026-10-17）**：**暂不发版** —— 维护者还有几处改动要先做完，
   本方案落地后留在工作树，随那批改动一起出 `0.6.3-beta.x`；转正时再定 `0.7.0` / `0.6.4`。
5. **详情页卡片**：保留（推荐）vs 移除（只留设置页一个入口）。

### 9.1 「导航位次」是什么

`settings.section` 的注册参数 `order` 是设置弹窗**左侧导航列表的排序键**（小的在上；上游自己用
`account -10 / general 0 / models 10 / plugins 15 / agent-presets 20`）。它决定「Catppuccin」这一项插在哪：

| `order` | 导航长相 | 说明 |
|---|---|---|
| 25（**已定**） | 账户 / 常规 / 模型 / 插件 / Agent 预设 / **Catppuccin** | 按官方编号约定（步长 5）排在所有官方节之后；`skills-manager` 同款 |
| 5（未采用） | 账户 / **常规 / Catppuccin** / 模型 / 插件 / Agent 预设 | 主题属外观，第一屏可见，但会插进官方节之间 |

只影响**位置**，不影响功能、不影响默认打开哪一节（默认仍是 `rows[0]` = 账户）。改一个数字即可反悔。

### 9.2 「滑块」的三种做法（A′ 已定）

**先分清三个滑块各自管什么**（它们是**玻璃质感**的三个轴，不是三个同类功能）：

| 滑块 | 实际作用 | 对应实现 | 调到两端的样子 |
|---|---|---|---|
| **模糊 blur**（0–40px） | 玻璃面板**背后内容**被揉匀的半径 | `--dsh-glass-blur` → 各面的 `backdrop-filter: blur(Npx)` | 0 = 不糊，背后的字/块看得清；40 = 强糊，只剩色块 |
| **霜化 frost**（0–100%） | 玻璃面自身**有多实**（填充不透明度倍率，50 = 基准 1.0，上限 1.4） | `--dsh-glass-frost` → 各处 `calc(52% * frost)` 等填充 alpha | 0 = 几乎全透（只靠发线与光斑分层）；100 = 最实，接近色卡 |
| **亮度 brightness**（深色 0–50 / 浅色 50–100） | **地面**（底色 wash + 光斑）整体压暗或提亮 | `--dsh-glass-brightness-white/black` → 地面与 `#fff`/`#000` 混色 | 越偏两端地面越亮/越暗；拉满时氛围场塌缩为纯白/纯黑 |

三者互不替代：blur 管"看不看得清背后"，frost 管"面板自己多实"，brightness 管"底色多亮"。

**差别只在"用什么控件改这三个值"**，不改变上面任何效果（A′ = 第一列 + 右侧可编辑数字框）：

| | A′ 滑块 + 数字框（已定） | 换官方 `stepper`（已否决） |
|---|---|---|
| 外观 | 上游没有 slider 原语，滑块只能按 token 自绘；数字框走官方输入件规格 | 与 `FontSizeRow` 逐像素一致，视觉最"原生" |
| 操作 | 拖动看连续变化；打字精确跳值（Enter/blur 生效）；↑↓ 按步长微调 | 点箭头逐格增减：frost 20→45 要按 25 下 |
| 数字 | **可编辑** | **只读文本**（官方原语没有可输入变体） |

⇒ **采用 A′**：滑块 + 右侧数字框（可拖动、可打字、可按步长微调）。stepper 被排除的原因是它的数字是**只读文本**
（官方 `FontSizeRow` 的 `value` 不可编辑），与"数字要能手动改"直接冲突。

**对比图**：`.debug/issue-27/compare-sliders.png`（源 `.debug/issue-27/compare-sliders.html`，本机文件、不入库）。
左 A′ = 滑块 + 可编辑数字（中间那格是聚焦态），右 B = 官方 stepper（箭头 hover 才出现）。
