# issue #33 — 设置面板里的第三方 fixed 弹层被重新锚定

报告：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/33>（`aszmk`，2026-11-01，open）
对象插件：`dsh-plugin-tool-management@0.21.9`（npm，作者 ouli1242，仓库 `ouli-1242/dsh-plugin-tool-management`）

## 症状（报告人原话）

> 这种选项和三个点更多打不开，悬浮菜单会乱跑

配图是「全部场景 ▾」下拉（记忆页的场景筛选）。实际还能复现的同类控件：MCP 页「全部级别」、
技能页「全部来源」、各列表行尾的「⋯」菜单 —— 全部出自同一个组件族。

## 机制

`backdrop-filter`（同 `filter` / `transform` / `contain`）会把元素变成**绝对/固定定位后代的包含块**。
本皮肤在

```css
[data-dsh-glass-float]  [role='dialog'][aria-modal='true']
[data-dsh-glass-compat] [role='dialog'][aria-modal='true']
```

上都写了 `backdrop-filter`（旧注释还声称「this panel carries no fixed-position descendants」），
而宿主把每个 `settings.section` 插件都渲染在这个面板里：

| 事实 | 出处 |
|---|---|
| 设置壳 = `.overlay{position:fixed;inset:0;display:flex;center}` + `.panel{width:800px;overflow:hidden;position:relative}` | `dsh-client-ui-settings-general/lib/client.js`（`VOzbGW_*`） |
| 插件挂载点 = `.content > .options{overflow-y:auto}`，插件注册 `slots.inject('settings.section')` | 同上 + 插件 `lib/client.js` |
| 插件的下拉/「⋯」= `position:fixed` + `left/top/bottom` 全用**视口坐标**，注释写「本插件没有任何祖先带 transform/filter」 | 插件 `lib/client.js` 的 `SourceSelect` / `RowMenu` |

⇒ 视口坐标被当成面板坐标，整体平移一个**面板原点**（1440 宽下 `(1440-800)/2 = 320px`），
再被面板 / `.options` 的 `overflow` 裁掉。

- 右对齐的「⋯」菜单（`left = box.right - 148`）被推出面板右缘 → **完全不可见 = 打不开**
- 面板中部的下拉 → 出现在离触发器 320px 的地方 → **乱跑**

## 真机取证（官方壳 + CDP，mica，blur=5，视口 1280×822）

面板 rect `(239.3, 59.3)`（= `(1280-800)/2`，与 CSS 完全对得上）。

| 操作 | `position:fixed;left:0;top:0` 探针的 x |
|---|---|
| 现状（面板 `backdrop-filter: blur(5px)`） | **240** |
| 面板 `backdrop-filter` 置 `none` | **0** |
| 恢复 blur | 240（可逆） |
| 改成 `::before` 平面承载 blur（`inset:0; z-index:-1; blur(6px)`） | **0** |

最后一行就是修复方案的有效性证明：blur 留在 `::before` 上时，面板不再是包含块。

## 修复

`src/client/glass/glass.module.css`（mica 与 compat 各一处，含新增的 `::before` 平面）：

```css
[data-dsh-glass-float] [role='dialog'][aria-modal='true'] {
  position: relative;
  isolation: isolate;   /* 给负 z 平面划边界；isolation 不是 backdrop root */
  background: none;     /* 宿主 .panel 的实底必须清掉，否则它成为平面的 backdrop */
  backdrop-filter: none;
  border: 1px solid var(--dsh-glass-rim);
  border-radius: 20px;
  box-shadow: var(--dsh-glass-edge), var(--dsh-glass-drop);
}
[data-dsh-glass-float] [role='dialog'][aria-modal='true']::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  border-radius: inherit;
  background: var(--dsh-glass-card-raised);
  backdrop-filter: blur(var(--dsh-glass-blur, 14px));
  pointer-events: none;
}
```

compat 同构（blur 兜底 `12px`，半径仍随宿主）。生成物 `glass-css.gen.ts` 由
`node scripts/gen-glass-css.mjs` 重生成，勿手改。

已知 1px 差异：`inset: 0` 是 padding box，比原来的元素背景（border box）少覆盖 1px 边框底；
边框本身是半透明 `--dsh-glass-rim`，不可见。

## 护栏

`tests/glass-css.spec.ts` → `backdrop-root hygiene` 组新增
`keeps the settings panel off the fixed-position containing block (issue #33)`：

- 面板本体（非 `::before`）**不得**有 `backdrop-filter`；
- 必须有两条承载 blur 的 `::before` 平面（mica + compat），且每条都自带 `background`；
- 面板本体必须是 `isolation: isolate` + `background: none`。

另把 frame-language 组的 `dialog()` 查找器改成排除 `::before`，否则会先命中平面规则。

## 后续（同一 issue 线程）：弹层「透到读不了」

位置修好后暴露的第二个问题：菜单展开后底下技能列表的文字直接穿过来。

| 事实 | 数字 |
|---|---|
| 设置缝把 `--dsw-alias-bg-layer-3` 换成 `30% + 30% * frost` | frost 20 ⇒ 42% |
| 插件弹层读的就是这个 token | `.dsm-select-menu{background:var(--dsw-alias-bg-layer-3)}` |
| 真机实测计算值 | `rgba(49, 50, 68, 0.42)`，`backdrop-filter: none` |

42% 的填充对「铺在面板上的设置卡片」是对的（底下同族、同色），对**弹层**是错的：它盖住的是密集、
无关的列表，而且没有 blur ⇒ 文字互相打架。

修法（`glass.module.css` 末尾新增一段，放在 compat 块之后以便在同等权重下按源序胜出）：

```css
[data-dsh-glass-settings] [role='menu']:not([data-menu-material]):not([data-menu-material] *),
[data-dsh-glass-settings] .dsm-select-menu {
  background: color-mix(in srgb, var(--dsh-glass-ground) 92%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: var(--dsh-glass-drop);
}
```

- **以地面色锚定**而不是继续叠 alias：alias 在缝里已经被稀释过一次，再叠只会继续稀。
- **这里的 blur 花得值**：#13 的「恒等 blur」只对「背后只有地面」的面成立，弹层背后是滚动的列表。
- **没用通用 `[role='listbox']`**：上游 `dsh-client-ui-schedule` 的 ClockPicker 把它挂在表盘列容器上，
  通用规则会把选择器糊成一块实板。`.dsm-select-menu` 是该插件自己的稳定命名空间（`dsm-` 前缀，
  `SourceSelect` 与 `RowMenu` 共用），且整条规则被 `[data-dsh-glass-settings]` 圈住，够不着别处。

真机复验：菜单 `color(srgb 0.067 0.067 0.106 / 0.92)` + `blur(12px)`，`dx=0 / dy=+4`（插件自己的 4px 间距）。

## 第三段：吸顶工具条成了一块直角色板

报告人的第二张截图：设置顶部的 `.dsm-panel-head`（装着「全局默认」下拉 + 场景/MCP/技能… 页签）
是一块**色调不同、四角笔直**的长方形，嵌在 20px 圆角的面板里。

| 事实 | 出处 |
|---|---|
| 该条是 `position:sticky; top:0; z-index:6`，填充 `var(--dsm-surface, var(--dsw-alias-bg-layer-2))` | 插件 `.dsm-panel-head` |
| 出厂皮肤里面板本身也是不透明的 layer-2 ⇒ 这条 bar **本来就该隐形**，所以它没做圆角 | 出厂设计 |
| 我们没动面板底色，只把它换成 ~25% 的 card-raised；bar 仍是 53% | 实测 `rgba(30,30,46,0.53)` |

⇒ 不是「多了一个色块」，而是「本来隐形的东西被显影了」。

修法（`glass.module.css` 末尾）：

```css
[data-dsh-glass-settings] .dsm-panel-head {           /* 不写 position：sticky 是这条 bar 的意义 */
  isolation: isolate; border-radius: 14px;
  outline: 1px solid var(--dsh-glass-rim-soft); outline-offset: -1px;
  background: none;
}
[data-dsh-glass-settings] .dsm-panel-head::before {
  content:''; position:absolute; inset:0; z-index:-1; border-radius:inherit;
  background: color-mix(in srgb, var(--dsh-glass-ground) 78%, transparent);
  backdrop-filter: blur(12px); pointer-events:none;
}
```

三个坑（都踩过）：

1. **blur 只能上平面**：这条 bar 里就装着插件的 `SourceSelect`，本体带 filter 会把它的固定定位菜单
   重新锚定 —— 正是本 issue 前半段那个缺陷。
2. **不能写 `position: relative`**：平面锚点那套习惯写法会直接干掉宿主的 `sticky`（第一版就这么写错，
   已改）。sticky 本身已经是定位元素，够 `::before` 用。
3. **描边用 `outline` 不用 `border`**：插件是两行 grid，`border` 会让内容整体位移 2px。
4. **要补内边距**：插件把内容贴着容器边缘排（出厂时这条 bar 隐形，没人需要留白）。变成卡片后
   「单会话独立设置」和页签会直接压在圆角边上，所以给 `padding: 6px 12px 4px`：
   左右 12px 让文字离开描边，底部 4px 让 `.dsm-tabs` 的下划线不再正好落在圆角上。

真机复验：`position:sticky` 保留、`border-radius:14px`、平面 `78% + blur(12px)`、下拉 `dx=0/dy=+4`。


## 第四段：入场动画里的 240ms 空窗

放置修好后还剩一个同源缺口：`@keyframes dsh-glass-dialog-in` 原本是
`from { opacity: 0; transform: translateY(8px) scale(0.985) }`。`transform` 会让面板在这
**240ms 内重新变成包含块**，此时此刻点开插件下拉就会中招。真机实测（把动画 pause 在 40%，
`animation-delay: -96ms`）：

| 版本 | 该帧 transform | 同帧开「全局默认」下拉 |
|---|---|---|
| 旧（translateY+scale） | `matrix(.9942,0,0,.9942,0,3.09)` | **dx=237 / dy=68**（应 0/+4） |
| 新（纯 opacity） | `none`，opacity `.61` | **dx=0 / dy=+4** |

改法是把它并入仓库既有的那条原则（页面过渡早就改成纯 opacity 了，理由逐字相同：
「a running transform would re-anchor position:fixed descendants mid-flight」）。
视觉上 8px 上浮 + 1.5% 缩放在 240ms 里肉眼不可辨（同一进度帧 A/B 截图几乎重合）。
护栏 = `tests/glass-css.spec.ts` 的 `dialog entry animation stays opacity-only (issue #33)`。

## 残留 / 后续
- **未修的同族项**：compat 的 `[data-sidebar-right-panel][data-sidebar-right-open]` 也带
  `backdrop-filter: blur(12px)`，该插件还 `slots.inject('sidebar.panellist')`。那个元素在某些状态下是
  `width:0`（子元素 `translateX` 溢出显示），平面不能直接换，需单独量一次再改。
- **插件侧**：它的「fixed 假设视口」本身脆弱，可建议作者改用 portal 到 `body`，但不能依赖。
- 修复只动材质承载方式，玻璃观感不变（面板 fill / blur / rim / shadow 四项取值一字未改）。
