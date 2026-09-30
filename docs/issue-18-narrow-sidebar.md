# issue #18 分析与结论：窄窗口（501×285）下侧栏 280px、主区 221px

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/18>
- 状态：**已定位并回复，无代码改动**——判定为 DSH 上游 `ui-layout` 的既定行为 + 上游 README 已列出的已知限制。维护者 2026-09-30 决策：不做插件侧「窄帧浮层守卫」，仅文档化（本笔记 + README FAQ）。
- 报告环境：DSH Desktop / Windows / 窗口内容区约 **501×285**、缩放 100%；报告人步骤「侧栏处于展开态 → 打开工作区列表」。
- 复现环境：DSH `0.1.7-rc.2`（`%APPDATA%\DSH\data\versions\0.1.7-rc.2\node_modules\@deepseek-ai\dsh\lib\bin.js`）+ Chromium（Playwright，`--no-proxy-server`）+ **临时 `DSH_HOME`**（`dsh plugin --profile web add link:<repo>`）+ 视口 501×285 + `locale: zh-CN`。
- 探针：`.debug/issue18-narrow.cjs`（**不入库**），出图 `.debug/issue18-{off,on}-narrow-{initial,expanded}.png`。

## 1. 结论

`280 / 221` 这组数字与报告人完全一致，但它由**上游**产生：视口 < 1024px 时侧栏默认自动收起；只有**手动点过侧栏开关**（`narrowExpanded`）才会以 280px 展开并挤压主区，主区 = 视口宽 − 280。本插件的样式表里没有任何 `grid-template-columns` 规则，玻璃开/关两轮的轨道值逐字符相同 ⇒ **本插件不在因果链里**。

## 2. 实测读数（本机，501×285）

| 状态 | 帧 `data-sidebar-collapsed` | 帧 inline `grid-template-columns` | 侧栏列 | 主区列 |
|---|---|---|---|---|
| 501px 载入、不点任何按钮 | 有 | `56px minmax(0px,1fr) minmax(0px,0px)` | 56×285 | 445×285 |
| 点一次侧栏开关 | 无 | `280px minmax(0px,1fr) minmax(0px,0px)` | **280** | **221** |
| 再点一次（收回） | 有 | 56px … | 56 | 445 |
| 开玻璃（云母）后重复以上 | 同上 | **逐字符相同** | 280（卡片 256×261 @ (12,12)，margin 12 / radius 20） | 221 |

- `501 − 280 = 221` 与报告人读数吻合；开关可逆；两轮 `pageerror` 均为 0。
- 收起态宽度随壳而异：`AppFrame.tsx:186-188` 的 `collapsedWidth` 在 `darwin` / `data-windows-titlebar` 下是 **0**（整列消失，开关移到标题栏左上角），社区壳 / 浏览器是 **56px 轨道**。报告人截图里开关在品牌行右侧（x≈246），与 56px 轨道的壳一致。

## 3. 上游依据（`D:\Vibe-Coding\.cache\dsh-ref\upstream`，tag `dsh-v0.1.7-alpha.2`）

| 位置 | 内容 |
|---|---|
| `packages/client/ui-layout/src/client/columns.ts:20-23` | `SIDEBAR_AUTO_COLLAPSE = 1024`；注释「Viewport width below which the sidebar auto-collapses to the rail …; a manual toggle below it re-expands over the squeezed center」 |
| `…/columns.ts:52-58` | `computeColumns`：收起的侧栏取 `collapsedWidth`，展开的侧栏 `clampWidth(px,264,420)`，`center = max(0, viewport − sidebar − rightbar)`；**侧栏本身不参与让位** |
| `…/stores.ts:108-112` | `toggleSidebar`：`viewportWidth < 1024` 时只翻转 `narrowExpanded`，否则翻 `sidebar === 0` |
| `…/stores.ts:115-122` | `setViewportWidth`：只在跨过 1024 时清 `narrowExpanded` ⇒ 窄帧展开态不能靠 resize 自然产生 |
| `…/AppFrame.tsx:178-192` | `narrow` / `sidebarCollapsed` / `sidebarPreference` / `normal` / `cols` 的实际求解；`collapsedWidth` 在 Windows 桌面壳为 0 |
| `…/ui-layout/README.md:28` | 「below 1024px it collapses automatically, and opening the right panel collapses a manually expanded sidebar」 |
| `…/ui-layout/README.md:88` | 已知限制：「**Extremely narrow windows** — after the right panel closes, the center may still fall below 400px; the left 56px rail remains.」 |

**滚动条**（报告人「没有滚动条或渐变提示」那半条）：侧栏滚动条是上游的**指针可达性**设计——指针在列外时缩略图被重绑成透明、离开后保留 2s（`packages/client/ui-sidebar/README.md` 的 Scrollbars 段；实现 `SidebarRoot.tsx` 的 `SCROLLBAR_LINGER_MS = 2000` + `quietBars`）。滚轮一直可用。

## 4. 因果链审计（为什么不是本插件）

- `src/client/glass/glass.module.css` 全文**没有** `grid-template-columns`；唯一涉及侧栏宽度的规则是 `[data-dsh-glass-frame]:not([data-sidebar-collapsed]) [data-dsh-glass-sidebar-root] { width: 100% !important }`（展开态下放开侧栏**根**的 inline 宽度），不触及栅格轨道。
- `src/client/glass/glass-layer.ts` 只写 `data-dsh-glass` / `data-dsh-glass-float` / `data-dsh-glass-compat` 等材质属性，不写布局。
- 玻璃开/关 A/B：轨道值逐字符相同（见 §2 第 4 行）。
- 旁证（**推断**，非结论依赖）：报告人截图采样地面 `rgb(24,25,37)`、侧栏 `rgb(30,32,47)` 属紫蓝色系（B−R≈13~17），而 DSH 原生暗色 token 为中性灰 `--dsw-alias-bg-base: rgb(21,21,23)`、`--dsw-specific-sidebar-fill: rgb(27,27,28)`（B−R=1~2）⇒ 当时 Catppuccin 主题是开着的；即便如此，轨道仍与插件无关。

## 5. 未采纳的方案（记录在案，供将来参考）

**窄帧浮层守卫**（纯 CSS，仅玻璃云母模式生效）：`@media (max-width:1023px)` 下把帧轨道覆写为 `0 minmax(0,1fr) 0`，并把侧栏列改为绝对定位浮层（自带遮罩），主区保持满宽。未采纳原因：需要 `!important` 覆写上游 inline 栅格；右栏打开（`data-rightbar-collapsed` 缺失）必须回退；56/0 两种收起宽度都要覆盖；本质是替上游做布局设计决定（上游若自己改成浮层会打架），且超出本插件「玻璃只改材质、不改布局语义」的定位。若将来上游确认开放 issue 通道，优先把「窄帧展开改浮层」提给上游。

## 6. 复现 / 重测步骤

```powershell
pnpm build
$env:DSH_BIN = "$env:APPDATA\DSH\data\versions\0.1.7-rc.2\node_modules\@deepseek-ai\dsh\lib\bin.js"
$env:NODE_PATH = "$env:APPDATA\npm\node_modules\@playwright\cli\node_modules"
node .debug/issue18-narrow.cjs
```

探针会：临时 `DSH_HOME` → `link:` 本仓库 → 起 `dsh web --no-open --port 0` → 走掉首次运行引导 → 在 501×285 下分别读「载入 / 手动展开 / 再收回」与「玻璃关 / 玻璃开」两轮几何，并截图。注意：全局 CLI（`%APPDATA%\npm\...\dsh`，0.1.5-rc.2）在本机缺 `@deepseek-ai/dsh-sandbox-local`，临时 home 启动会失败 —— 必须用 `DSH_BIN` 指向上表那份自带整套包的 0.1.7 运行时。
