# issue #39 — Latte + 玻璃：tooltip 被「气泡」规则一起刷成玻璃，白字白底

报告：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/39>（`JG1214`，2026-11-07）
环境：插件 `0.7.1` + 官方桌面壳 `0.2.2-rc.1`（Windows 11）、**Latte**、玻璃开、**云母（mica）**、
blur 5 / frost 20（滑条值，`--dsh-glass-frost: 0.4`）/ brightness 50、视口 1280×822
目标版本：**`0.7.2`**（`0.7.1` 已发，修复按 `AGENTS.md` 版本号规则顺延）

## 症状

Latte 下开玻璃，把鼠标悬到转录区的消息操作按钮（「复制」「在新对话中分支」…），
提示气泡里的文字几乎看不见；关掉玻璃恢复。报告人附了两张 ~380×120 的裁图。

## 机制：子串选择器吃到了宿主自绘的 tooltip

`src/client/glass/glass.module.css` 的 mica 气泡规则（0.6.x 起）：

```css
[data-dsh-glass-float] [data-conversation-scroll] [class*='bubble'] {
  border-radius: 14px;
  border: 1px solid var(--dsh-glass-rim-soft);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) calc(46% * var(--dsh-glass-frost, 1)), transparent);
}
```

宿主的 tooltip 组件（`dsh-web-frontend` 的 `_bubble_44yfq_1`，0.2.1-rc.3 与 0.2.2-rc.1 同类名）是：

```css
._bubble_44yfq_1 {
  position: fixed;
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-static-neutral-bluish-00);   /* ← 硬编码，不跟填充走 */
}
```

tooltip 默认 **不 portal**（`portal` 只在菜单里传 `true`），挂在转录区按钮上时是
`[data-conversation-scroll]` 的**内联后代** —— 于是 `[class*='bubble']` 命中它，把
`--dsw-alias-tooltip-bg`（Latte = `#4c4f69`）替换成 18.4% 的浅玻璃，而文字仍是
`--dsw-static-neutral-bluish-00`（Latte = `#eff1f5`）。

真机读数（同一条「复制」tooltip，`.debug/issue-39/probe.mjs`）：

| 状态 | `background-color` | `color` | 对比度 |
|---|---|---|---|
| 修复前 · 玻璃开 | `color(srgb .937 .945 .961 / .184)` | `rgb(239,241,245)` | **1.00:1** |
| 修复前 · 玻璃关（属性摘除 A/B） | `rgb(76,79,105)` | 同上 | **7.06:1** |
| 修复后 · 玻璃开 | `rgb(76,79,105)` | 同上 | **7.06:1** |

只有 Latte 会报：三个深色风味的 tooltip 文字是浅色、玻璃也是深色，碰巧仍可读
（Mocha 实测 tooltip 底色 `#313244` / `#181825`，最低对比度 8.69:1，修复前后一致）。

同一段子串还顺手命中了 `BfLV8a_bubbleWidth` —— 问答气泡的**尺寸包装层**（自己不带填充），
被多画了一层 14px 圆角 + 1px rim，视觉上和内层气泡形成双框。

## 修法：把座位点名，而不是猜子串（方案 B）

```css
[data-dsh-glass-float] [data-conversation-scroll] [data-message-bubble],
[data-dsh-glass-float] [data-conversation-scroll] [class*='bubbleWidth'] > [class*='bubble']:not([role='tooltip']) {
  /* 原填充/rim/圆角不动 */
}
```

- `[data-message-bubble]`：宿主自己的稳定钩子。全库只有一个组件设置它
  （`UserMessageBubble` 包装层，0.2.2-rc.1 的 `app.asar` 里 `grep` 只命中 1 处），
  真机上 4/4 个用户气泡都带。
- 问答回复气泡**没有** data 钩子，所以用「宽度包装层的**气泡子元素**」定位，
  包装层本身不再被画；再补 `:not([role='tooltip'])` 兜住「以后有人把 tooltip 塞进包装层」。

**没有选方案 A（只给旧子串加 `:not([role='tooltip'])`）**：它只堵住这一个已发现的洞，
下一次宿主再加一个 `*bubble*` 类（例如气泡内的子元素）还是会重演；点名座位后，
新增宿主类不会自动被玻璃吃掉。

## 验证

真机（Latte + mica，0.2.2-rc.1）逐项核对：

| 目标 | 修复前 | 修复后 |
|---|---|---|
| `[data-message-bubble]` ×4 | 玻璃填充 18.4% + 0.67px rim + 14px | 不变 ✅ |
| `BfLV8a_bubbleWidth`（包装层） | 被填 + 被描边 | `transparent` / 0 边框 / 0 圆角 ✅ |
| `BfLV8a_bubble`（问答气泡） | 玻璃填充 | 不变 ✅ |
| `span._bubble_44yfq_1[role=tooltip]` | 浅玻璃 + 白字（1.0:1） | 宿主原色（7.06:1）、无 rim、圆角回到宿主 ✅ |

- 云母全量扫描（`.debug/issue-39/sweep-tooltips.mjs`，逐个悬停可见按钮）：Latte 采到 10 条 tooltip，
  **无一条低于 4.5:1**；Mocha 最低 8.69:1。
- 兼容模式（`data-dsh-glass-compat`）复测同一条 tooltip 仍 7.06:1 —— 该模式本来没有这条规则。
- 「宿主自有填充被玻璃替换」的全量审计（`.debug/issue-39/audit.mjs`：玻璃开/关两次快照 diff 计算样式）：
  云母转录页与账号菜单、兼容模式**带 role 的原生座位被替换数量 = 0**；设置对话框有 **1** 个
  （`AnXs9G_panel`，`role=dialog`，自身填充变透明）—— 那是 #33/#34 定下的形状：材质在它的 `::before` 平面上，
  容器本体零绘制，不是缺陷。
- 同一轮里被替换的其余 13~14 个填充全是皮肤有意接管的面（用户气泡、composer 卡、菜单材质面等）。
  ⚠️ **口径更正（2026-11-07 晚）**：当时用「声明色 vs 按 `bg-base` 合成的近似背景」算过一次
  「6.37 → 7.06，无一下降」，那只覆盖**这些被换掉填充的面本身**，不能代表「文字压在玻璃面板上」的情况。
  同元素逐项 A/B（`compare.mjs`）显示是真的有降级：轨迹页签 5.53→4.23、状态栏 5.38→4.87，
  最低 3.59（该项玻璃关也只有 4.34）。详见 `docs/legibility-sweep-2026-11-07.md`。

## 收尾：座位连形状也不动（同日追加）

第一版修完后 `[role='tooltip']` 仍被另一条规则改圆角：

```css
[data-dsh-glass-float] [role='menuitem'], [data-dsh-glass-float] [role='tooltip'], … { border-radius: 8px; }
```

它不改变颜色，实测也不影响可读性，但和 #17 的取向冲突：**座位既然不是我们的，就不该替它定形**。
已把 `[role='tooltip']` 从该组摘掉（菜单项与 `*pill*` 保留 —— 它们坐在皮肤已接管的表面里）。

**观感上是 no-op**：宿主 `--dsw-radius-sm: 8px`（`dsh-web-frontend` 的 `index-*.css` 里声明），
与我们原来写死的 8px 相同 —— 撤掉只是不再重复声明别人的 token，截图前后无差异。

护栏追加第三条：**整份样式表不得有规则直接寻址 `[role='tooltip']`**。
判定前先把 `:not(...)` 剥掉，否则 `:not([role='tooltip'])` 会被误判 —— 它的作用正是排除该座位。
变异验证：把它加回圆角组，这条断言立刻失败。

## 护栏

`tests/glass-css.spec.ts` › `native seats are never glass-filled (issue #39)`：

1. 用真机量到的类名 / 钩子造三个合成座位（`span._bubble_44yfq_1[role=tooltip]`、
   `[data-message-bubble]`、`.BfLV8a_bubbleWidth > .BfLV8a_bubble`），
   断言**任何声明了 `background` 的规则都不得命中 tooltip 或宽度包装层**；
2. 正向锁定：用户气泡与问答气泡仍被同一条规则覆盖，且填充来自 `--dsw-alias-bg-layer-1 × --dsh-glass-frost`。

第 1 条与既有的 #17 断言互补：#17 用 `selector.includes("[role='tooltip']")` 抓「显式写 role」的规则，
对子串规则天然失明；新断言走 `Element.matches()` 语义匹配，子串规则躲不过。
变异验证：把选择器退回旧的 `[class*='bubble']`，新组的 2 条断言都会失败。

## 残留 / 未做

- 报告人未给版本、模式与滑条值。本机在 `0.7.1` + 云母 + frost 20 下复现，已足够定位；
  回帖里按「Latte + 玻璃 + 云母」复述并请复验即可。
- 顺带看到一个不属于本条 issue 的观感项：云母下**菜单材质面**在低 frost 时只剩 26% 填充
  （stock 58%），菜单里的字仍可读（深字浅底 7.06:1），但背景内容会透得很明显。
  是否给菜单设一个填充下限，另议。
