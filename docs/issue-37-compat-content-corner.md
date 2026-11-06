# issue #37 — 兼容模式内容列左上角的宿主圆角透出氛围地面

报告：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/37>（`aurasuisui`，2026-11-05）
环境：插件 `0.7.0` + 官方桌面壳 `0.2.2-rc.1`（Windows 11）、Latte、玻璃开、**兼容模式**、
`glow: true`（强度 150% / 尺寸 250%）、blur 8 / frost 60 / brightness 50
目标版本：**`0.7.1`**（`0.7.0` 已发，修复按 `AGENTS.md` 的版本号规则顺延）

## 症状

兼容模式下，内容列（`centerCol`）左上角出现一块淡蓝色缺口，像「本该贴合却被切了一个圆角」。
云母模式看不到；关掉地面光斑后缺口退化成近乎同色，但圆角仍然看得出来。

## 机制：两半合起来才显形

**① 宿主本来就在那里画了一个 16px 圆角，并且用侧栏色垫在它背后。**
`dsh-client-ui-layout/lib/client.js`（0.2.0-rc.2 起就有，0.2.1-rc.5 实测一致）：

```css
[data-windows-titlebar] .frame {
  --dsh-windows-content-radius: 16px;
  padding-top: var(--dsh-windows-titlebar-height);   /* 40px */
  background: var(--dsw-specific-sidebar-fill);
}
[data-windows-titlebar] .centerCol {
  background: var(--dsw-alias-bg-base);
  border-radius: var(--dsh-windows-content-radius) 0 0 0;
  corner-shape: round;
}
```

圆角切掉的那一小块（`x ∈ [侧栏宽, 侧栏宽+16]`、`y ∈ [40, 56]`）**落在 `frame` 自己的盒子里**，
所以官方观感里露出来的是 `frame` 的侧栏色 —— 与左侧栏、与原生标题栏同色，读起来是「设计好的圆角」。
`--dsh-windows-content-radius` 全库只有 `centerCol` 一处消费（`grep` 命中 2 处：声明 + 使用）。

**② 本皮肤把 `frame` 的填充无条件抹掉了。**
`src/client/glass/glass.module.css` 的

```css
[data-dsh-glass] [data-dsh-glass-frame] { background: transparent; }
```

**没有按模式收敛**。这条对 web 壳、macOS 壳和 mica 都是对的（`frame` 是最后一层会盖住地面的东西），
但在 compat 下它顺手擦掉了宿主的一个「有理由的」表面：页面底色交给 `body` 的地面（#25 wash + 两枚光斑），
于是那 16px 缺口里透出来的是**地面 + glow 1**（12% 份额、座位 18%/6%，再乘强度旋钮 150% ⇒ 18% 蓝），
淡蓝就是这么来的。

**为什么 mica 看不到**：mica 下侧栏是 12px 内缩的卡片，`centerCol` 的填充已被释放（`:244`，float 专有），
那个角落在卡片内部，读起来是卡片自己的圆角。compat 没有间隙，它就成了一个孤立的缺口。

## 这是「#28 决策 4」漏掉的一半

`centerCol` 释放规则上方的注释早就写明：

> gated to float/mica: **compat keeps the official opaque sidebar**, and an official
> sidebar beside a ground-showing transcript would be the opposite mismatch.

compat 承诺「stock layout stays byte-for-byte」，而「不透明侧栏 + 透明 `frame`」正好违背它：
侧栏列、`centerCol`、原生标题栏都不透明，只有那 16px 是洞。所以本次不是新增材质，是补齐那条决策。

## 为什么不用报告人的 A（归零圆角）

报告人给的片段是：

```css
html[data-dsh-glass-compat][data-windows-titlebar] { --dsh-windows-content-radius: 0px }
```

**它不生效。** `--dsh-windows-content-radius: 16px` 声明在 `frame` **元素自身**上，
而自定义属性不靠继承覆盖——元素一旦有自己的声明，`html` 上的值就再也传不到 `centerCol`。
要用 A 必须打到 `[data-dsh-glass-frame]` 或 `> [class*='centerCol']` 上。

### 实测反证（Chrome `--headless=new`，上游 CSS 子集逐字复制，Latte 取值）

复现文件 `.debug/issue-37/probe.html`（gitignored）。`getComputedStyle` 读数：

| 写法 | `centerCol` 左上圆角 | `frame` 计算底色 |
|---|---|---|
| 0.7.0 现状（只有释放规则） | 16px | `rgba(0, 0, 0, 0)` ← **就是这块洞** |
| 报告人 A：变量写在 `<html>` 上 | **16px**（毫无变化） | `rgb(230, 233, 239)` |
| A′：变量写在 `[data-dsh-glass-frame]` 上 | 0px（能生效，但不是我们要的方向） | `rgb(230, 233, 239)` |
| 本次 B | 16px（几何不动） | `rgb(230, 233, 239)` ← 与侧栏、原生标题栏同色 |

⇒ 报告人的**根因分析完全正确**，只有「改写落在哪个元素」这一步错了：自定义属性的级联不认继承，
`html` 上的赋值永远打不过 `frame` 元素本地的 `16px`。

即便修正了写法，A 还有两个问题：

1. **违反 compat 的定义**：compat 的唯一承诺是「宿主原样」，零半径是主动改掉一个宿主设计维度；
   `tests/glass-css.spec.ts` 里已有断言写着「Geometry stays upstream's … re-stating a radius here
   would silently reshape the title bar area」。
2. **收益并不更大**：两种改法都只影响那 16px×16px。B 之后 compat 下地面彻底不可见——但它**本来
   也只在缺口里可见**，所以视觉代价≈0。

## 实现（1 条声明）

```css
html[data-dsh-glass-compat][data-windows-titlebar] [data-dsh-glass-frame] {
  background: var(--dsw-specific-sidebar-fill);
}
```

- **读宿主的 token，不自造颜色**（规则 4）：compat 下本皮肤从不改写 `--dsw-specific-sidebar-fill`
  （那条改写是 float 专有，见原生标题栏块），所以 `frame` / `sidebarCol` / Windows 原生标题栏三者
  天然同色——缺口靠「与邻居同色」消失，和官方壳一模一样。
- **`html[...][...]` 是承重的**：上游把填充声明在 `[data-windows-titlebar] .frame`（0,2,0），
  上面那条释放规则也是（0,2,0），本条 (0,3,1) 必须压过两者，而不是靠插件 `<style>` 恰好后落。
- **两道门都必须留**：`-compat` 命中 mica ⇒ 不透明板盖死整页地面；缺 `[data-windows-titlebar]`
  ⇒ web / macOS 壳白白藏掉地面。
- 不改几何：半径原样保留，只是让缺口重新读成侧栏。

Latte 数值（`src/client/palettes.ts`）：`bg-base` = `neutral-bluish-00`（#eff1f5）、
`sidebar-fill` = `neutral-bluish-50`（#e6e9ef）⇒ 官方缺口是「灰一档的圆角」，现在是「蓝一档」。
深色三风味同理（`sidebar-fill` = `neutral-bluish-900`，比 `bg-base` 的 950 亮一档）。

## 边界

| 场景 | 结果 |
|---|---|
| web 壳（`<html>` 无 `data-windows-titlebar`） | 不命中，`frame` 仍透明，地面照常透出（#26 的根基） |
| macOS 壳 | 不命中（`centerCol` 只有底色、无圆角，本来没缺口） |
| **mica / float + Windows** | **必须不命中**：命中即整页地面被不透明填充盖死 |
| 玻璃关 | 整张表被 `[data-dsh-glass]` 门控，不生效 |
| 侧栏收起（宽 0） | 缺口落在窗口左缘，填侧栏色，与官方一致；圆角在 y=40 之下，不碰 Win11 窗口圆角 |
| 全屏 `[data-fullscreen]` | 仍命中：该属性只改 `--dsh-frame-overlay-top`，`padding-top` 仍是 40px |
| compat ↔ mica 热切 | 填充瞬时进出，只影响 16px 角；**不要**加 transition（会闪） |
| 第三方在 `sidebarCol` 局部改写 `--dsw-specific-sidebar-fill` | 可能出现 1px 接缝；compat 下本皮肤不碰该 token，属低风险 |

## 护栏

`tests/glass-css.spec.ts` 新增 `compat keeps the host frame fill (issue #37)` 一组，三条：

1. 命中规则恰好 1 条，`background` 必须是 `var(--dsw-specific-sidebar-fill)`；
2. 不含 `-float`、必须锚在 `html[data-dsh-glass-compat][data-windows-titlebar]`；同时通用释放规则仍在；
3. **全表不得出现 `--dsh-windows-content-radius`**，本条也不得带 `border-radius`（把 A 钉死为拒绝态）。

连带改动：`native caption rides the mica sheet` 那组的 `caption` 过滤器从「decls 里出现过该 token」
收紧为「**声明**该 token（`--dsw-specific-sidebar-fill:`）」。原过滤器把「读」也算成「写」，
而本次新规则正是**读**——语义上它压根不是 caption 覆盖（compat 保留官方值才是本意）。

## 同类排查（2026-11-06）

两个方向都扫了一遍：① 宿主在 `[data-windows-titlebar]` 下还切了哪些圆角；② 我们还有哪些
`background` 擦除器没按模式收敛。

**① 宿主圆角。** `grep -rho 'data-windows-titlebar\][^{,]*{[^}]*border-radius[^}]*}'
@deepseek-ai/*/lib/client.js` 命中 3 条，其中 1 条是折叠态新会话按钮的 `--dsw-radius-sm`（与本变量无关）。
另外两条都是 `--dsh-windows-content-radius`：

| 位置 | 消费者 | 判定 |
|---|---|---|
| `dsh-client-ui-layout` | `[data-windows-titlebar] .centerCol` | **本条 bug** |
| `dsh-client-ui-sidebar-right` | `[data-sidebar-right-panel='fullscreen'] [data-dockkit-column='0'][data-dockkit-pane]` | **无需处理**：面板 `.P3OORG_panel` 与 dockkit pane 都不画底色（`grep background` 均命中 0），圆角背后在官方与 compat（修复后）都是 `frame` = 侧栏色；mica 下 `frame` 透明，而这块面板本来就整块透地面（没有玻璃卡片），属既定观感。**反过来，修复前 compat 的全屏右栏背后是地面**（比 16px 大得多），修复后一并回到侧栏色 |

**② 未按模式收敛的擦除器。** 共 4 处，逐条判定：

| 擦除规则 | 宿主原本画什么 | 结论 |
|---|---|---|
| `[data-dsh-glass-frame]` | 侧栏色（compat + 标题栏下还切 16px 角） | **本条 bug**，已收口 |
| `[data-dsh-glass-details]`（右栏面板） | 什么都不画：`.P3OORG_panel` / `[data-dockkit-pane]` 的 `background` 命中 0 | no-op，安全（旧壳的 `[class*='detailsCol'] [class*='root']` 分支未验证，本机无对应版本，P3） |
| `[data-phase]`（会话根） | 不画底色（`dsh-client-ui-chat` 全包 `grep data-phase…background` 命中 0） | no-op，安全 |
| `[data-phase] [class*='composerSeat']` | active 态有 `linear-gradient(0 → bg-base 36px)` 底部渐隐 | **故意**：compat 的输入卡是半透明的，留着渐变会在卡片内部切出一道硬边；底部那片由 #28/#29 的 dock 带补偿，两模式共用 |

结论：本次修复后，**没有第二处会显形的同类 bug**；全屏右栏那处是「顺手也修好了」。

## 真机验收（2026-11-06，壳 `0.2.2-rc.1` / Windows 11 / 1280×822 / dpr 1.5）

条件按报告复现：**compat + Latte + glow 开（强度 150% / 尺寸 250%）**，blur 5 / frost 20 / brightness 50。
`--remote-debugging-port=9333` + `.debug/real-verify/cdp.mjs`，读数如下：

| 项 | 值 |
|---|---|
| 缺口原点（`centerCol` 左上） | `(280, 40)`：侧栏右缘 280 = 标题栏高 40 |
| `centerCol` 圆角 | `16px`（上游未变） |
| 修复态 `frame` 计算底色 | **`rgb(230, 233, 239)`** = `#e6e9ef`，与 `sidebarCol` 完全同色 |
| 注入 0.7.0 语义（`background: transparent !important`） | `rgba(0, 0, 0, 0)` → 底下露出 `body` 地面（wash + 2 glows，`--dsh-glass-glow:1`、`--dsh-glass-glow-strength:1.5`） |
| 移除注入后 | 回到 `rgb(230, 233, 239)`（规则未被污染） |
| `elementFromPoint(284, 44)` | `FRAME` —— 缺口像素的绘制者就是 `frame`，不是 `centerCol` |
| mica 回归 | `data-dsh-glass-float` 在场时 `frame` 仍为 `rgba(0,0,0,0)`，新规则不误命中 |

壳里 `data-windows-titlebar` / `--dsh-windows-titlebar-height:40px` 与上游 `.frame`
（`--dsh-windows-content-radius:16px` + `background:var(--dsw-specific-sidebar-fill)`）、
`.centerCol`（`bg-base` + 该半径）逐字未变，类名哈希从 `pI_x6G` 换到 `mP3x-q`，
子串 `sidebarCol` / `centerCol` 仍在 ⇒ seam 打点与新规则都照旧命中。

⚠️ **本轮没有像素截图**：该壳窗口 `visibilityState === 'hidden'`，`Page.captureScreenshot`
（含 `clip` / `captureBeyondViewport`）与 `Page.startScreencast` 全部挂住（8s / 6s 无响应无帧），
`Page.bringToFront` 与 `Page.setWebLifecycleState('active')` 都拉不回来。取证只到「计算样式 + 命中测试」。
另：窗口 hidden 时 rAF 冻结，seam 钩子要手动补一遍（`.debug/real-verify/stamp.js`），否则
`[data-dsh-glass-frame]` 根本不存在 —— 首次读数 `frameTag: null` 就是这个原因，不是规则没生效。

## 残留

- 像素级前后截图仍未拍（原因见上，不是待办遗漏）。
- compat 下地面彻底不可见是**既定行为**，不是回归：该模式的价值在浮层/弹层/输入卡的通用玻璃材质。
- 上游升版审计时必查两处：`--dsh-windows-content-radius` 与 `.frame` 的填充配方（若宿主换成
  非 token 配方，本规则需跟着改）。
- 发版：本修复**不单独发**，等 issue #38 的改动落地后同批发（维护者 2026-11-06 定）。

