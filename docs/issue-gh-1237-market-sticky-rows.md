# 第三方面板市场的吸顶行（上游 `dsh-market#1237`，2026-11-18）

> 撞号说明：`1237` 是 **`dsh-market/dsh-market`** 的 issue 号，不是本仓库的。
> 按 `AGENTS.md` 规则（新增 issue 文档先看上游有没有同号，撞了加 `gh-` 前缀），
> 文件名取 `issue-gh-1237-*`。

## 现象

「插件」页的「插件市场」tab 里，两条吸顶行（banner+页签行、分类行）在滚动时是一块
**纯 `--dsw-alias-bg-base` 的平色板**：Latte 下 `rgb(239,241,245)`，而旁边地面是
`rgb(210,222,245)`…`rgb(226,233,240)`（吃了 wash + 光斑）。单像素硬切、无 mask、无 blur。

stock 下看不见，因为那块板**就是**页底色；本皮肤把页面换成 `#25` 的氛围地面之后，
它成了屏上唯一一块纯 `bg-base` 的矩形 —— 与 issue #40 主问题同一个病，只是这次
画它的是**第三方**：`dshmarket` 自己的三条 `position: sticky` 规则。

## 为什么皮肤侧曾经不该顺手治

- 三条 sticky 面的类名是 hashed（`nUhMVa_head` / `.cats` / `.stickyHead`，前缀每次构建都变）
  ⇒ 只剩 `[class*='_head']` 那条路，而那是 issue #17 / #21 退休的写法；
- 它当时的钩子只到容器级：`data-dsh-market-root` / `-plugins-tab` / `-portal` / `-tab` /
  `-nav-icon` / `-crashed`，**三条 sticky 面上一个 `data-*` 都没有**；
- 覆写 `--dsw-alias-bg-base` 也不成：该子树里卡片、输入框都在消费它。

## 上游已经解决（不用我们提 issue）

- 报告：**`dsh-market/dsh-market#1237`**（`YV3507`，2026-11-16）「安装透明主题后吸顶的
  搜索/分类条会盖住卡片文字」，取值与上面那组完全对得上；
- 修复：**PR #1246** `fix(client): let a theme paint the sticky rows only while they are stuck`，
  2026-11-17 05:06Z 合入 `main`；
- 出货：**`1.73.21`**（2026-11-18 13:59Z）。`1.73.20` 在此之前发布，**不含**修复。

它给的钩子（我核过 `1.73.21` 的 `client/client.js` 与解包产物）：

```css
.nUhMVa_stickyHead,
.nUhMVa_head,
.nUhMVa_cats                 { background: var(--dshm-sticky-bg, var(--dsw-alias-bg-base, #fff)) }

.head[data-dshm-stuck=true],
.cats[data-dshm-stuck=true]  { background: var(--dshm-stuck-bg, var(--dshm-sticky-bg, …)) }
```

- **两个变量它自己一处都没声明**（`--dshm-*` 的声明只有 `cycle` / `empty-view-height` /
  `host-sticky-top` / `plugins-head-height` / `wave`）⇒ 值只能从主题侧注入，未设时回落到
  `--dsw-alias-bg-base`，即原宿主零变化；
- `data-dshm-stuck="true"` 由 `markStuck()` 写在 `.head` / `.cats` 上，判定 `isPinned()`：
  `top ∈ [line-4, line+2]`，`line = scroller.top + hostStickyTop`。

## 本皮肤的接法（`glass.module.css`）

```css
[data-dsh-glass-float] [data-dsh-market-root][data-dsh-market-plugins-tab='true'] {
  --dshm-sticky-bg: transparent;          /* 静止：交还地面 */
  --dshm-stuck-bg: <body 地面三层声明逐字复制>;
}
[data-dsh-glass-float] [data-dsh-market-root][data-dsh-market-plugins-tab='true'] [data-dshm-stuck='true'] {
  background-attachment: fixed;           /* 视口锚定：46px 的行装不下 100vh 的 wash */
}
```

三条理由与 issue #40 v1→v2 的教训一致：

1. **静止态不能有任何填充**。这里不是「填得准」的问题：行在静止时属于页面，画什么都是白板。
2. **吸顶态必须是地面场本身**，不是采样色（v1 的平色 + blur 在光斑开启时偏差 +9…+20/255）；
   平色也仍会是一条色带。
3. **不能用 `--dsh-glass-card`**：layer-1 在深色风味比地面亮一档，吸顶行会比它盖住的页面更亮。
4. 视图口锚定只能写在元素上（自定义属性带不了 `background-attachment`）；
   `background-attachment: fixed` **不是**造包含块的那几个属性（`filter` / `transform` /
   `backdrop-filter`），所以 #19 / #33 / #41 的卫生不受影响。

范围是 **float only**：compat 下宿主自己那层不透明板就是 `--dsw-alias-bg-base`，行本来就一致，
动它反而是 #37 修掉的那种错配。

## 真机验证（2026-11-18，官方壳 `0.2.2-rc.3`，mica / mocha / frost 20 / 光斑关）

把 `dshmarket` 覆盖安装到 `1.73.21`（`desktop` profile）后，在真页面里量计算样式：

| 状态 | `.head` | `.cats` | `.stickyHead` |
|---|---|---|---|
| 修复前（1.73.19/20） | `rgb(17,17,27)` | `rgb(17,17,27)` | `rgb(17,17,27)` |
| 静止（本规则） | `rgba(0,0,0,0)` / image `none` | 同左 | 同左（此处 `display: contents`） |
| 吸顶（打 `data-dshm-stuck`） | `background-image` 与 `document.body` **逐字节相同**（324 字符） | 同左 | 未参与 |

- 变量确实传递：`getComputedStyle(root).getPropertyValue('--dshm-sticky-bg') === 'transparent'`；
  `--dshm-stuck-bg` 解析为地面表达式。
- `background-attachment` = `fixed, fixed, fixed`（三层都锚定）。
- `.stickyHead` 在 plugins tab 里 `display: contents`、rect `0×0`（1.73.21 实测）⇒ 不参与绘制。

⚠️ **本次没能验证到的**：窗口 `hidden` 时 rAF 冻结 ⇒ 上游 `apply()` 不跑，
`data-dshm-stuck` 是**手动打上去**的，所以「吸顶切换的时序」没有真机观察；像素级 A/B 同样
因为截图不可用而未做（`background-image` 与 body 全等 + `fixed` 锚定，是等价性的结构证据，
与 #40 v2 用的是同一条论证）。

## 边界与后续

- `.stickyHead` **没有 stuck 态**（只有 `.head` / `.cats` 有）。它在插件 tab 里是
  `display: contents`，只在市场自己的首页绘制，而那一面本仓库从未量过 ⇒ 保持上游默认
  （`--dshm-sticky-bg` 的 `transparent` 对它只在「不绘制」时成立）。要在那里上材质，
  应先请上游补一个 stuck 标记。
- 中间态：`.head` 已吸顶、`.cats` 还在流内时，`.cats` 是透明的（它是独立判定）。
  两者间隔只有一个 head 高度，实际滚动里几乎同时切换。
- 若有下次，把窗口拉成 `visible` 再跑一遍吸顶切换的像素差，补上本文件第一条空洞。
