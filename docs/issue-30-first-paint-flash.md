# issue #30 补充：首屏先闪官方深色（pre-paint 调色板注入）

> 报告人：`ripley-xl`（2026-10-27 在 issue #30 的**补充评论**，与 pendingLocalPush 竞态是**两个独立问题**）。
> 他已在 0.6.4 上本地实现并给出实测（CPU 3x、全新浏览器、隔离 profile）：原始版首帧中心像素 `#151517`
> （官方深色）→ 修复后 `#232634`（Frappé crust）。**状态：方案，未实施。** 属渲染时序改动 + Host 侧新增
> 注入，建议 `0.6.6`（修复），实施前要维护者点头（不是 #28-B 那种"特性分级"问题，但会改变所有用户的首次绘制）。

## 1. 现象与根因（已按 0.2.1-rc.3 出厂包复核）

即使 `flavor` 持久化为 `catppuccin-frappe`，**首帧仍是官方深色**，随后才切到风味。原因不是持久化：

1. 官方 `dsh-client-ui-theme` 的 Host half 在 `webserver/index-inject` 里 **prepend** 两条启动行
   （`lib/index.js` 的 `bootThemeInjections`）：
   - head `<style>`：`:root{color-scheme:dark}body{background-color:#151517;--dsh-boot-bg:#151517}`
     （`light` 分支是 `#fff`；`system` 分支用 `@media(prefers-color-scheme:dark)` 包一层）；
   - body `<script>`：把 `data-ds-theme-source` / `data-ds-dark-theme` 按偏好设好（`toggleAttribute`）。
2. 挂在 `<body>` 上的官方 token 表（客户端 bundle 里的 `design_platform_css_default`，选择器是 **`body`**）
   随之生效 —— 首屏就是官方深/浅色。
3. Catppuccin 的主题只能在客户端 bundle 执行后 `theme.register()` + `setTheme()`，**必然晚于首帧**。
4. 启动屏（`_boot_*` 类）的底色是 `var(--dsw-alias-bg-base, var(--dsh-boot-bg, Canvas))`
   ⇒ 只要 pre-paint 阶段就把 `--dsw-*` 写进 `body`，启动屏会直接用风味的地面色。

## 2. 接缝（出厂包核实，0.2.1-rc.3）

| 事实 | 出处 |
|---|---|
| `ctx.on('webserver/index-inject', (table) => table.push(...))`，行是**纯 JSON 可序列化**的 `IndexInjection` | `dsh-host-webserver/lib/types/injections.d.ts` |
| 行类型：`{kind:'style',text}` / `{kind:'script',placement:'head'\|'body',text}` / `{kind:'html',placement,html}` / `{kind:'global'}` / `{kind:'script-src'}` | 同上 |
| 渲染规则：head 行紧跟 `<head>` 开标签、body 行紧跟 `<body>` 开标签，**各自按 table 顺序**；`tapIndex` 在其后 | 同上 `renderIndexInjections` |
| 官方主题的行是 `{ prepend: true }` ⇒ **它在表头，我们 append 在表尾** ⇒ 同优先级时我们后写获胜 | `dsh-client-ui-theme/lib/index.js` 的 `apply` |
| 响应**没有 CSP 头** ⇒ 内联 `<style>` / `<script>` 不会被拦（官方自己也这么干） | `grep Content-Security-Policy dsh-host-webserver/lib/index.js` = 0 命中 |
| 主题 id 与色板：`CATPPUCCIN_FLAVORS`（`src/client/palettes.ts`）**无任何 import**，Host bundle 可直接引 | 文件头无 import，190 token/风味 |
| 体积：190 token × 1 风味 ≈ **13.1 KB**（裸文本，实测按 `palettes.ts` 计；gzip 后约 2~3 KB） | 本机测量 |

Host 侧读当前风味：`Config` 已导出、`CatppuccinConfig` 已声明 `.get()` 访问器
（`src/settings-catppuccin.ts`），`apply(ctx, config)` 一直没用第二个参数 —— 本次要用。
**注意**：`.get()` 只在 ≥ 0.1.7 的 volatile 字段上存在；≤ 0.1.6 的 `config.flavor` 是普通字符串、
且那里的持久层是 `installSection` 的命名空间（不在 config 里）⇒ **legacy 宿主上不注入**（capability 检测）。

## 3. 方案 A（采纳报告人的做法）

### 3.1 Host half（新增 `src/boot-palette.ts`，在 `src/index.ts` 注册）

```ts
// 纯函数，便于单测：不给 config 时返回 []（legacy / off / 未知风味）
export function bootPaletteRows(config: CatppuccinConfig | undefined): IndexInjection[] {
  const flavorId = readVolatile(config?.flavor)            // typeof v?.get === 'function' ? v.get() : v
  const flavor = CATPPUCCIN_FLAVORS.find((f) => f.themeId === flavorId)
  if (flavor === undefined) return []                      // off ⇒ 交还官方
  const overrides = cssSafeOverrides(readVolatile(config?.overrides))
  return [
    { kind: 'html', placement: 'head', html: bootPaletteStyle(flavor, overrides) },
    { kind: 'script', placement: 'body', text: bootPaletteScript(flavor) },
  ]
}
```

- **样式行**（`kind:'html'` 而不是 `kind:'style'`，为了能带标记属性、供客户端精确摘除）：

  ```html
  <style data-dsh-catppuccin-boot>
  :root{color-scheme:dark}
  html body,html body[data-ds-dark-theme]{--dsw-static-…:…;…;background-color:var(--dsw-alias-bg-base)}
  </style>
  ```

  三个要点：
  - 选择器用 **`html body`**（0,0,2）压过官方 token 表的 `body`（0,0,1）——客户端那份
    `design_platform_css` 在 bundle 里、比 head 行更晚生效，只有提高特异性才稳，**不能只靠顺序**；
  - `body[data-ds-dark-theme]` 那一支保证属性被官方脚本设成对面时也压得住；
  - 全套 190 token 必须整表注入：表内 `--dsw-alias-*` 大量写成 `var(--dsw-static-*)`，**子集会让未列出的
    引用塌成官方值**（局部错色比闪一下更糟）。
  - `:root{color-scheme:…}` 跟风味走（Latte → light）：滚动条、表单控件、`Canvas` 关键字都会跟着变。
- **脚本行**（必须在官方那条之后跑，append 顺序保证）：

  ```js
  (() => { document.body.toggleAttribute('data-ds-dark-theme', true/false) })()
  ```

  只碰 `data-ds-dark-theme`，不动官方的 `data-ds-theme-source` 与字号/字体变量。

### 3.2 Client half：**风味真正生效后**摘掉这张表

留在 DOM 里会钉住 body 的全部 token（`html body` 优先级 + 声明覆盖），用户之后切 light / off 会被它盖住。
所以摘除条件不是"任何 `setTheme` 被调用"（报告人的做法），而是"风味主题已经接管"：

```ts
const clearBootPalette = (): void => {
  for (const el of document.querySelectorAll('[data-dsh-catppuccin-boot]')) el.remove()
}
```

调用点（`src/client/index.ts` 的 restore effect 内）：

1. `scheduleRestore` 的 microtask 里 —— `theme.setTheme(desired)` 之后（无论抛错与否都摘，因为页面已经在
   走风味的 setTheme 路径）；
2. `applyDesired` 里 `preference === desired` 的早退分支 —— **reload 后 runtime 偏好本来就等于风味 id 时
   根本不会调 setTheme**，不补这一处就会挂着等到兜底；
3. 用户显式选 light/dark/system，或在 Catppuccin 行选 `off` 时无条件摘除；
4. `setTimeout(10_000)` 兜底 + effect teardown 时摘除（报告人也用了 10s 兜底）。

### 3.3 为什么 `off` 时 Host 侧什么都不注入

`flavor: off` ⇒ 返回 `[]` ⇒ 页面与 0.6.5 完全一致（官方 pre-paint 行为）。这条也是回归护栏：
**关掉风味时页面不该多出任何 style/script 行。**

## 4. 备选（记录未采纳理由）

| 方案 | 做法 | 结论 |
|---|---|---|
| B：只注入最小子集 | 只给 `--dsw-alias-bg-base` + `label-*` + `border-*` + `brand`，约 200 B | 体积诱人，但（a）这些 alias 自己是 `var(--dsw-static-*)`，子集会让引用落回官方值；（b）启动屏之后的第一帧已挂载组件会用到更多 token，局部错色比整段闪更显眼。**不做**，除非实测 13 KB 有可接受性问题 |
| C：`webServer.tapIndex` 直接改 HTML 字符串 | 绕过结构化行 | 同一能力但更脆（字符串替换）、静态 worker 部署不通用（worker 走 JSON 行 + page-side 解释器）。**不做** |
| D：在 `index.html` 里加 `data-ds-dark-theme` 静态属性 | 零 JS | 只能解决"官方深色"这一半，风味色表还是官方值；且 index.html 不在我们手里 |
| E：等上游加"插件主题 pre-paint"能力 | 提 issue 给 DSH | 正解但不可控；可同时提（见 §8） |

## 5. 风险与边界

| 风险 | 处置 |
|---|---|
| **13.1 KB 内联/每次 index 渲染**（gzip ~2–3 KB，且每页只渲染一次） | 接受。若后续觉得大，走方案 B 的"用完整静态表 + 只保留 alias 层"折中，实测后再定 |
| **只在 ≥ 0.1.7 生效**（legacy 宿主 config 无 `.get()`，持久值也不在 config 里） | capability 检测；legacy 上不注入、行为与今天一致。README/CHANGELOG 写明"首屏预绘需要 DSH ≥ 0.1.7" |
| **行顺序假设**（官方 prepend、我们 append） | 样式靠特异性自保；script 只依赖顺序设置一个属性，最坏是首帧标签色差一档，不致命。若上游改成 append，加一条 e2e 断言兜住 |
| **overrides 注入等于把用户字符串写进 `<style>`** | `sanitizeOverrides` 之上再过滤：值含 `<` `>` `\` `}` 或 `</` 一律丢弃；key 只认 `--` 前缀（已有）。单测锁定 |
| **摘除时机漏点** ⇒ 用户切 light/off 被钉住 | §3.2 的四个调用点 + 10s 兜底 + dispose；单测覆盖"有表要摘/无表 no-op/off 要摘" |
| **静态 worker 部署**（`kind:'html'` 行是否被 page-side 解释器支持） | 行类型表里 `html` 是有 placement 的一等行，两种渲染器共用同一张表；实施时用 e2e 的 worker 分支确认一次 |
| **双窗口**：A 窗口切成 mocha，B 窗口还挂着 frappe 的旧表 | 表是页面级、reload 后按 Host 当前值重发；B 在风味变化时摘表（storage 事件已有），不会钉住 |

## 6. 测试

- `tests/boot-palette.spec.ts`（新，Host 侧纯函数）：
  1. `off` / 未知风味 / `undefined` config ⇒ `[]`（off 时页面不多任何行）；
  2. 四个风味各一条：`color-scheme` 与 `data-ds-dark-theme` 的取值、`html body` 选择器、190 个 token 全在；
  3. `overrides` 叠加在表尾（后写胜）+ 危险值过滤（`}</style><script>` 之类）；
  4. `text`/`html` 里不出现 `</style`、`</script`（行契约）；
  5. legacy 形态（`config.flavor` 是裸字符串）⇒ `[]`。
- `tests/reentrancy.spec.ts` 或新 `tests/boot-palette-client.spec.ts`（jsdom）：
  6. 有表 → 风味生效后摘除；7. 无表 → no-op（不抛）；8. `off` 选择 → 摘除；9. teardown → 摘除。
- 变异：把 `html body` 降成 `body` ⇒ 用例 2 红；去掉危险值过滤 ⇒ 用例 3 红；把摘除只留在 `setTheme` 分支
  ⇒ 用例（"reload 后偏好已是风味"）红。

## 7. 真机验收（本机，待跑）

1. `pnpm build`（本地 profile 是**符号链接**指向仓库，构建即生效）→ 重启壳。
2. CDP：`Emulation.setCPUThrottlingRate {rate: 3}` + 冷启动，截首帧（`Page.captureScreenshot` 在
   `Page.loadEventFired` 前采样若干帧），取中心像素，与报告人口径对照：
   原始 `#151517` → 期望 `#232634`（frappe）/ `#eff1f5`（latte）。
3. 反向：`flavor: off` 时首帧仍为官方 `#151517`（不该多出任何行）。
4. 切到 light **后**不应被表钉住（这是摘除的验收点）：切 light → 刷新 → 首帧 official light、
   挂载后仍是 light。

## 8. 顺带（可选）

给上游提一条 issue：「插件主题没有 pre-paint 钩子，首帧只能靠注入仿造；建议在 `IndexInjection` 里
提供 `kind:'theme-tokens'` 或允许插件声明 boot palette」。这是我们这套的做法能被上游吸收的正路。

## 9. 工作量

Host 模块 ~120 行 + Client 摘除 ~40 行 + 两个测试文件 + 文档 ≈ 2~3 小时（含真机首帧采样）。
**前置决定**：① 整表 13 KB 是否接受；② 是否同时向上游提 §8；③ 版本号 `0.6.6`。
