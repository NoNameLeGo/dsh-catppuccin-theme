# issue #29：底部状态栏背板是实色块，缺磨砂玻璃

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/29>（2026-10-19，无标签，无评论）
- 状态：**已实施（方案 A / 磨砂幕布），随 `0.6.4-beta.0` 发到 beta 渠道**。改动 =
  `src/client/glass/glass.module.css`（dock 带子配方重写）+ `tests/glass-css.spec.ts`（#28 的护栏翻面 + 2 条新增）。
- 报告环境：**未提供**（风味 / 玻璃模式 / 宿主 / 版本都没写）——回帖要问。
- 前置：issue #28（同一块带子，`docs/issue-28-composer-dock-backdrop.md`）。

## 1. 现象

> 底部状态栏重叠问题已经修复，但加上的背景是一层纯色色块（不透明的实色），没有模糊效果，和界面里其他
> 区域（顶栏、侧边栏、对话框）的磨砂玻璃质感不一致。① 质感割裂 ② 滚动时生硬（边缘硬切）③ 遮挡感重。

## 2. 根因

#28 当时的选择：**填充 = 地面色、α = 1、不加 blur**（`docs/issue-28-...` §3 决定 3）。它解决了「正文穿透」，
代价就是报告人看到的「一块焊在输入卡下面的实色板」。

`#28` 代码注释里那句「issue #13 的预算只为『覆盖移动内容』的面付费，这里已经是实色」**自相矛盾**：这条带子
压着的**正是**滚动的正文（否则 #28 不会发生）。所以按规则 4 推论一，这里加 blur 是**合法**的，属于
「覆盖移动内容必须保留 blur」那一侧。当时真正的理由是「实色填充 ⇒ blur 看不见」，不是「blur 不该付钱」。

## 3. 修法（方案 A：磨砂幕布）

```css
[data-dsh-glass] [data-phase] [data-dsh-glass-inputbar] > [class*='dock']::before,
[data-dsh-glass] [data-phase] [data-dsh-glass-inputbar] > [data-composer-dock]::before {
  /* 几何全部沿用 #28：全宽出血、bottom:-4px、height:100%+12px、z-index:-1 */
  background: color-mix(in srgb,
    color-mix(in srgb, var(--dsh-glass-ground), #000 calc(5% * var(--dsh-glass-ambience)))
      calc(70% + 10% * var(--dsh-glass-frost, 1)),
    transparent);
  backdrop-filter: blur(var(--dsh-glass-blur, 14px));
  -webkit-mask-image: linear-gradient(180deg, transparent 0, black 18px);
  mask-image: linear-gradient(180deg, transparent 0, black 18px);
}
```

四个决定：

1. **填充必须还是「地面色」，不能用 `--dsh-glass-card`。** 这条带子不是卡片：它全宽出血到座席边缘，
   而 `--dsh-glass-card`（layer-1）比地面亮 —— 铺上去就是页面底部一块更亮的矩形，正是 #28 决定 4 花力气
   避免的东西。地面色在**任意 alpha** 下对纯地面都逐像素不可见，只在真有正文经过时才显形。
2. **α 有硬下限 70%**（`70% + 10% × frost`，frost 0.4 默认 ⇒ 74%，封顶 84%）。原因：出厂「clear」预设是
   `blur: 0`，α 再低正文就会从状态栏读数底下透出来 —— #28 原地复活。方向与其它面一致（frost 越大越实）。
3. **blur 上 `::before`，dock 元素本身保持零绘制**。dock 里挂过/可能挂弹层（模型选择），一旦元素本身带
   `backdrop-filter` 就成了它的 backdrop root（#19）。护栏单列一条。
4. **顶部用 `mask-image` 而不是渐变填充**：mask 会**同时**淡出填充与 blur 输出（页面上下渐隐带是同一机制），
   所以正文是「化开」而不是「被一条硬边切断」。18px 必须跨过藏在卡下的那 ~8px 头部。

兼容模式（`data-dsh-glass-compat`）走**同一条规则**：它挂在 `[data-dsh-glass]` 上，`--dsh-glass-blur`
两种模式都由 `glass-layer.ts` 写入。compat 里其它面的 12px 是硬编码惯例，这条带子刻意跟随滑块
（它是功能性条带，不是装饰面）。

## 4. 为什么不做 B（玻璃条 pill）

维护者先要 A/B 对比，实测后否决 B（资产：`.debug/issue-29/compare.html` + `compare.png` + `zoom.png`）：

| 项 | 结论 |
|---|---|
| 两侧露字 | dock 行是居中 flex、内容不满宽 ⇒ pill 左右两侧的正文**原样露出**，#28 只修了中间一段 |
| 拉成全宽（B′） | 露字没了，但那等于「A + 一条横穿正文的描边」，观感不如 A 干净 |
| 几何 | 要覆盖上游 `.dock` 的 `width: calc(...)` 与负 margin，上游一改结构就废 |
| #19 | 材质挂 dock 元素本身 ⇒ 弹层若挂在 dock 内即成 backdrop root |
| 真正「和顶栏一样」 | 是 #28 方案 B（卡 + dock 融合成一个 24px 圆角框），属特性，仍需维护者批准 |

像素探针（模拟页 `?shift=-20`，条带行 y=612 CSS 的亮度标准差）：现状 1.83 / **A 3.13** / B 5.14 / B′ 5.78
⇒ A 的「透」是**淡影**级别，既解决了硬切与遮挡感，又不会退回 #28 之前的读不清。

## 5. 验证

| 项 | 结果 |
|---|---|
| `pnpm typecheck` / `typecheck:tests` / `build`（含 `gen-glass-css`） | 通过 |
| `vitest run`（`--no-file-parallelism`） | 见 §6 |
| 变异：删掉 `backdrop-filter` | 红（`keeps the blur on the surfaces that do cover moving content` + 本块） |
| 变异：α 下限改回 `52% * frost` | 红（`issue #29: 70% is the floor`） |
| 变异：把 blur 挪到 dock 元素上 | 红（`never puts the blur on the dock element itself`） |
| 真机 CDP 像素探针（渐变坡长度、条带与沟槽 Δ） | **未跑**（本机 Playwright 死路，壳进程易被回收） |
| 四风味 × mica/compat × blur 0/5/12 | **未跑** |

## 6. 待确认

- 回帖问报告人：风味 / 玻璃模式（mica 还是兼容）/ 宿主（web 还是官方桌面壳）/ 版本 / blur 与 frost 滑块值。
- 真机若发现 `mask-image` 没有淡出 blur 输出（Chromium 版本差异），回退方案 = 长渐变填充 + 把带子顶部
  再往上延伸，让硬边整个藏在卡后面（几何改 `height: calc(100% + 20px)`）。
- 手感旋钮（只这两个，别动别的）：mask 坡长 18px、α 下限 70%。
