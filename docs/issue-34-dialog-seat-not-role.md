# issue #34 — `aria-modal` 不是座位：图片预览层被写成流内元素

报告：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/34>（`aurasuisui`，2026-11-02）
修复：PR #35（同作者）→ squash `e117509`，目标版本 **`0.6.7`**
回归源：`0.6.6` 的 #33 修复（`6dce204`）

## 症状

输入框贴图 → 点缩略图 → 全屏预览层不出现：页面保持原样，只有一枚 36×36 的关闭按钮飘在应用框右下角
外面，点它无反应。深浅主题相同、与风味无关；禁用插件或退回 `0.6.5` 立即正常。

## 机制：两个「面」，同一条选择器

`0.6.6` 的 #33 修复给 `[role='dialog'][aria-modal='true']` 加了 `position: relative`
（让 `::before` 的 `inset:0` 解析到面板而不是 `.overlay`）。问题是这条选择器同时命中两种形状完全不同的面：

| 面 | 宿主标记 | 靠什么定位 | 被改成 `relative` 之后 |
|---|---|---|---|
| 设置壳 | `.overlay[role=presentation] > .panel[role=dialog][aria-modal]` | 外层 `.overlay` 是 fixed | 无影响（面板本来就是卡片） |
| primitives `Modal` | `.root[role=presentation] > .dialog[role=dialog][aria-modal]` | 同上 | 无影响 |
| 图片预览 `ImageLightbox` | `body > div[role=dialog][aria-modal]` | **这一层自己** `position:fixed; inset:0` | **塌成 0 高**：子元素全是 `absolute` ⇒ 高度 = 0，落到 `#root` 之后的流里，图片与遮罩一起消失，`top/right:20px` 的关闭按钮留在框外 |
| 桌面壳账户页 `PlatformOverlay` | `body > .overlay[role=dialog][aria-modal]` | 同上（`position:fixed;inset:0;z-index:1001`） | 同上；**桌面壳专属、需进账户页才渲染**，web 模式不可达 |

特异性能算清：本皮肤的 `(0,3,0)` 压过宿主的 `(0,1,0) ._backdrop_*`，所以浮层被降级。
`0.6.5` 正常是因为当时这条规则只写 `background` + `backdrop-filter`，没动 `position`。

## 修法：座位守卫

两条规则（float / compat，各含 `::before` 材质面）收窄到**宿主的座位**：

```css
[data-dsh-glass-float]  [role='presentation'] > [role='dialog'][aria-modal='true'] { … }
[data-dsh-glass-compat] [role='presentation'] > [role='dialog'][aria-modal='true'] { … }
```

- #33 的结论（材质整体搬 `::before`、面板本体零绘制、`isolation` 不是 backdrop root）**原样保留**。
- `position: relative` 保留：0.2.1-rc.5 的面板本身已是 `relative`，但更老的宿主面板可能是 `static`，
  那时 `::before` 的 `inset:0` 会解析到 `.overlay` 上（整个视口），保留它更稳。
- 失败方向安全：宿主哪天改了座位结构 ⇒ 面板少一层装饰，而不是预览层坏掉。

## 真机取证（0.2.1-rc.5，mica / blur 5 / frost 20 / mocha，1440×900 视口，无头 Chrome 156 + CDP）

临时 `DSH_HOME` + `dsh plugin --profile web add link:<repo>`（加载仓库 `lib/`，即 `0.6.6` 语义），
用 `DOM.setFileInputFiles` 给 composer 塞一张 PNG 触发**真实 `ImageLightbox` 实例**：

| 阶段 | `position` | `getBoundingClientRect()` | 关闭按钮 | `::before` |
|---|---|---|---|---|
| 修前（4 条裸规则） | `relative` | **(0, 721, 1413, 2)** | (1356, 823) —— 在框外 | `blur(5px)` |
| 同页就地改写为座位守卫 | `fixed` | **(0, 0, 1418, 802)** | (1362, 20) | `none` |

同页对照：设置面板（`VOzbGW_panel`）与 primitives `Modal` 在两态下都是
`seat=true`、`::before` 为 `blur(5px)`、面板内 `position:fixed;left:0;top:0` 探针仍在 **(0,0)**
⇒ #33 的修复没有被返还。

## 护栏

`tests/glass-css.spec.ts` 的 `dialog seat guard` 组：任何出现 `[role='dialog'][aria-modal='true']`
的规则必须同时带 `[role='presentation'] >` 座位。变异（去掉 4 处守卫）实测变红并点名 4 条规则；
#33 的 `planes` 正向断言仍然绑在同一批规则上（不是删掉规则就能绿）。

## 遗留与判据

1. **守护的只是 CSS 一半。** `src/client/glass/glass-seams.ts` 的 settings 接缝用的是
   `:has(> [role="dialog"][aria-modal="true"])`，body 直挂的对话框会让 **`<body>` 被打上
   `data-dsh-glass-settings`**（真机确认）。但**观感没变**：本插件的调色板写在 `<body>` 的
   **内联 style**（12k+ 字符，含 `--dsw-alias-bg-layer-1`）里，内联压过样式表 ⇒ body 上的 settings
   remap 是惰性的。属代码卫生 / 潜在隐患（P3），收法是把接缝选择器改成
   `[role="presentation"]:has(> [role="dialog"][aria-modal="true"])`，并补一条「body 不得被标记」的断言。
2. **账户页那一面未真机触发**：`dsh-client-ui-settings-account` 的 `PlatformOverlay` 在 rc.3 / rc.5
   源码里都是 body 直挂的 `[role=dialog][aria-modal]`（`_44HXVa_overlay{position:fixed;inset:0;z-index:1001}`），
   web 模式不渲染；本次守卫把它一并排除，属**源码 + 合成复现**的推断，没在真机点进账户页。
3. 座位依赖宿主 DOM 形状：上游若给面板加 wrapper，玻璃会静默消失（无测试能发现），失败方向是可接受的降级。
4. 探针方法论警告：**别用内联 `style="position:fixed"` 造被测节点**——内联压过样式表，会得到
   「一切正常」的假阴性；复刻宿主必须照宿主的样子用**类名**声明定位。

## 判定

报告人的根因判断正确；修法在真机上双向验证成立。文档侧同步了 `README.md` / `README.en.md` /
`docs/glass-mis-hits.md` 的命中族表与 `docs/issue-33-fixed-popover-containing-block.md` 的选择器注记；
`AGENTS.md` 增补「推论五：`aria-modal` 不是座位」。
