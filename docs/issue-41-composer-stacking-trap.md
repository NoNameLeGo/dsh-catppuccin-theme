# issue #41 — composer 卡的层叠上下文把卡内浮层封顶（compact-suite 的压缩面板）

报告人 `aurasuisui`（CONTRIBUTOR，2026-11-14 开，**issue 仍开、0 评论**）。环境：
`@nonamelego/dsh-catppuccin@0.7.0`（玻璃开，云母与兼容都试过）+ 官方桌面壳 `0.2.2-rc.3`（Windows 11）
+ `dsh-compact-suite@2.9.2`。

对应规则：`AGENTS.md` 规则 4 的**推论七**；护栏：`tests/glass-css.spec.ts` 的
`composer stacking trap (issue #41)`。

## 1. 症状（报告人原话）

输入框工具条上的「压缩」chip 点开是一个 420px 宽的面板（`.dcs-wrap` 内的 `position: fixed; z-index: 60`），
玻璃开启时：

1. 被会话内容盖住一部分（「看起来像半透明地混在正文里」）；
2. 面板自己的毛玻璃变成灰糊（「背后的文字/图形只剩色块」）。

关掉玻璃总开关后两条都消失。

## 2. 报告人的归因：一条成立、一条不成立

| 他的归因 | 判定 |
|---|---|
| 皮肤给卡加了 `z-index: 8`（float）/ `isolation: isolate`（compat），面板的 `z-index: 60` 只是「卡内的 60」⇒ 被页面里更高的层压住 | **成立**（见 §3.1） |
| `isolation: isolate` 让卡成为 backdrop root，面板的 `backdrop-filter` 只读得到卡自己那层，卡本体 `background: 0 0` ⇒ 读空 ⇒ 灰糊 | **不成立**（见 §3.2） |

## 3. 本机复盘（headless Chromium，同构 DOM，`.debug/probe-41/`）

复现件的结构照搬皮肤：`.transcript`（高对比条纹 + 正文，`position: absolute`）/ `.cover`（`z-index: 9`，
模拟页面里高于卡的层）/ `.seat` / `.card`（材质面在 `::before`：半透明填充 + `blur(10px)`，本体零绘制）/
`.panel`（400×300，`z-index: 60`，半透明填充 + `blur(12px)`）。

| 变体 | 卡 | 面板定位 | 面板 vs `z-index: 9` | 面板 backdrop 读到 | 卡的材质 |
|---|---|---|---|---|---|
| a | `z-index: 8` + `isolation: isolate` | absolute / fixed | **被 9 盖住** | 页面条纹（软色带，正常） | 正常 |
| b | 仅 `z-index: 8` | absolute / fixed | 被 9 盖住 | 页面条纹（**与 a 观感一致**） | 正常 |
| c | 仅 `position: relative` | absolute / fixed | 升到 9 之上 ✓ | 页面条纹 | **消失**（`z-index:-1` 沉到定位的转录层之下） |

复跑（`.debug/` 已 gitignore，不进仓库）：

```sh
chrome --headless=new --screenshot=out.png "file:///<abs>/.debug/probe-41/probe2.html#af"
# `#` 后第一位是卡变体：a = isolation + z-index / b = 仅 z-index / c = 无上下文
# `#` 后第二位是面板定位：a = absolute / f = fixed
```

### 3.1 症状 1 = 层叠上下文封顶（确证）

`[data-dsh-glass-float] [data-composer-card]` 持 `position: relative; z-index: 8`，compat 那份持
`isolation: isolate`（无 z-index）。这是**载荷**：转录正文、宿主 dock 行（`z-index: 7`，与卡同在
sticky/absolute 座位里、排在卡下方）与上下渐隐带（`position: fixed; z-index: 7`）都低于 8，卡必须压住它们，
否则玻璃读的是正文（#28）。（浮空模式下代码块吸顶条的粘性本身已被 `[class*='banner'] { position: static }`
关掉，不参与这场竞争——别再把它当理由。）代价是卡内**任何后代**的 `z-index` 被封顶在卡的层上，
`position: fixed` 不豁免（变体 af / bf 实测）。

### 3.2 症状 2 的归因被推翻

- 变体 a 与 b 观感一致 ⇒ `isolation` 对「读空」零贡献；
- 规范侧：`filter-effects-2` §3 的 Backdrop Root 七条触发条件是 `filter` / `opacity < 1` / `mask` /
  `clip-path` / `backdrop-filter` / `mix-blend-mode` / 对应的 `will-change`；注释还明写
  「**a Backdrop Root is not formed by elements with z-index applied, fixed or sticky-positioned elements,
  and elements with transforms applied**」⇒ `isolation`、`z-index`、`fixed`、`transform` 都不形成 backdrop root；
- 与 #19 的实测口径一致：那次读空的是**祖先 `backdrop-filter`**，与 `isolation` 无关。

### 3.3 为什么不能「删掉隔离」解决

变体 c：去掉卡的层叠上下文，面板确实升到 9 之上，但**卡的材质面沉到定位转录层之下，玻璃整块消失**。
`z-index: -1` 的材质面必须有层叠上下文兜住（这正是 #19 引入 `isolation` 的原意）。

### 3.4 宿主侧还有一半（不在皮肤职责内）

宿主 `dsh-client-ui-conversation` 自 0.2.2 给 composer 座位写了
`[data-phase=active] .…_composerSeat { will-change: transform }` ⇒ 卡内任何 `position: fixed` 后代都把该座位
当**包含块**，视口坐标被重新锚定（报告人已在 `NoiraBaka/dsh-compact-suite#2` 定位并建议 portal）。
`transform` / `will-change: transform` 同样不形成 backdrop root（同上规范注释），但「成为包含块」比 z-index
封顶更狠：面板不只是被压住，而是整体平移。

## 4. 判定（对报告人给的三条路）

| 他的方案 | 判定 | 理由 |
|---|---|---|
| 1. 立文档约定：第三方浮层 `createPortal(document.body)` | **采纳** | 唯一同时躲开「卡层封顶」与「宿主 `will-change` 重锚定」的做法，且不动皮肤结构 |
| 2. 材质挪进 wrapper、卡本体不必 `isolation` | **否决** | ① `z-index` 必须挂在卡的某个祖先上，卡内浮层依旧被封顶——只是把笼子往上挪一层；② 去掉层叠上下文材质面直接沉底（§3.3）；③ 宿主 `will-change` 在更外层，皮肤侧重构救不了定位那半 |
| 3. 只在 known-issues 记一笔 | **否决** | 不给插件作者任何可执行信号，同类 issue 会重来 |

## 5. 症状 2（灰糊）待定，三条候选

**真机取证前不得写死**（取证见 §6）：

- **H1｜面板自带的大半径模糊 × 我们的半透明填充**。compact-suite 直接借宿主菜单 token：
  `.dcs-panel { background: var(--dsw-menu-surface-fill); backdrop-filter: var(--dsw-menu-backdrop-filter,
  blur(40px) saturate(150%)) }`。皮肤只在**菜单表面**（`[data-menu-material='translucent']`）覆写这两个 token，
  `.dcs-panel` 拿的是 stock `blur(40px) saturate(150%)` + 58%/45% 填充 ⇒ 正文被 40px 揉成色块。
  玻璃关掉后背后变成座位的不透明底板（开玻璃时 `[data-phase] [class*='composerSeat'] { background: none }`
  把它抹掉）⇒ 读的是平色，于是「看起来正常」。
- **H2｜二次模糊**。面板与卡的材质面（`blur(14px)`）、dock 条平面（`blur(...)`，#29）重叠时，14px 之后再 40px。
- **H3｜其实是症状 1 的观感**。覆盖者与面板的半透明填充叠在一起，被读成「糊」。

## 6. 取证（真机，官方壳 + CDP，约 25 分钟）

```sh
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS -u WORKBUDDY_CLIENT_USER_AGENT \
  "./DeepSeek Harness.exe" --remote-debugging-port=9333              # 后台起
NO_PROXY="127.0.0.1,localhost" node .debug/real-verify/cdp.mjs eval '<expr>'
```

1. `.dcs-panel` 的 computed：`backdrop-filter` / `background-color` / `--dsw-menu-backdrop-filter`
   （开、关玻璃各一次）⇒ 定 H1；
2. 面板矩形内 A/B：把面板 `backdrop-filter` 置 `none`，按 #19 的「条纹 stdev」口径比 ⇒ 定 H1 vs H3；
3. 逐个 `visibility: hidden` 掉 `header`（8）/ `[class*='sidebarCol']`（9）/ `[data-dsh-glass-fade]`（7），
   看谁让开 ⇒ 定「覆盖者」到底是哪一层；
4. `_composerSeat` 的 `will-change` / `transform`（0.2.2-rc.3）⇒ 确认 §3.4。

⚠️ 窗口 `hidden` 时截图不可用（2026-11-06 实测），只走计算样式 + `elementFromPoint`。

## 7. 本轮改动（CSS 零改动）

1. 本文档；
2. `AGENTS.md` 规则 4 的推论七 + 「与报告人协作」的跨插件回帖模板；
3. `README.md` / `README.en.md`「第三方插件的浮层约定」；
4. `tests/glass-css.spec.ts` 的 `composer stacking trap (issue #41)` 4 条；
5. `CHANGELOG.md` 的 `[Unreleased]` 条目（发版时归 `0.7.4`）。

**不改 CSS 的理由**：唯一能动的 `isolation` 实测零效果（§3.2）；动 `z-index` 只有两个方向——调低让材质沉底、
调高让卡盖住侧栏（9）与顶栏（8）。`glass-css.gen.ts` 因此不用重建。

## 8. 残留

- 卡内浮层的上限是**契约**，不是缺陷：compact-suite 未 portal 前会一直撞；
- H1–H3 未定，取证后回填本文档 §5；
- 宿主 `_composerSeat{will-change:transform}` 随时可能扩大范围或换命中面，届时契约仍成立，但要复核 §3.4 的版本号；
- 报告人的 `#41` 关闭条件：文档可查 + 回帖给了可执行方案，**不要求面板被修好**（那在 compact-suite 侧）。

## 9. 材质那半（2026-11-16）：把半径调小没用，得把 blur 去掉

§7 当时判「CSS 零改动」，只对了一半：层叠上下文那半确实只能靠 portal，但**灰糊**那半是皮肤能碰的。
报告人的原话给了决定性线索 —— 「面板自己的毛玻璃变成灰糊（背后的文字/图形只剩色块）」「关掉玻璃总开关后两条都消失」。
而面板借的是 stock 菜单材质：

```css
/* dsh-compact-suite 2.9.2 的 .dcs-panel，原文 */
background: var(--dsw-menu-surface-fill);
backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
```

它渲染在输入卡**内部**，所以它的 backdrop = 卡那层半透明平面 + 正在滚动的正文。40px 一叠，字就是灰块。

### 复现（replica，不是真机）

compact-suite 在 `0.2.2-rc.3` 上起不来（宿主删了 `primitives.useAnchoredPosition`，见 §10），
于是按真实结构搭 replica：面板**放进**卡内、卡材质逐条照抄 `glass.module.css` 的 float 卡（`isolation: isolate`
+ `::before` 的 `blur(14px)` + 52% 填充）、面板 420×320、底下 13px 正文。
口径：面板矩形内缩 6px，12.4 万像素，量**残留的高频结构**（`|L − 3×3 邻域均值|` 的均值），
以「没有面板时的同一区域」为 100%。资产：`.debug/issue-41/panel-ab.html` + `metrics.mjs`。

| 变体 | detail | 相对原始 | 观感 |
|---|---|---|---|
| 无面板（原始正文） | 5.047 | 100% | — |
| stock：`blur(40px) saturate(150%)` + α0.7 | 0.009 | **0.2%** | 全灰 |
| `blur(14px)` + α0.7（皮肤自己的旋钮） | 0.041 | 0.8% | 还是灰 |
| `blur(14px)` + card-raised 填充 | 0.049 | 1.0% | 还是灰 |
| **无 blur** + card-raised 填充 | 1.863 | **37%** | 字能读 |
| 无 blur + stock 填充 | 1.527 | 30% | 字能读 |

**结论：轴是 blur 本身，不是半径。** 40→14 只是 0.2% → 0.8%，肉眼同一片灰；再换更实的填充也没用。
所以皮肤侧唯一有效的动作是把卡子树里的 `--dsw-menu-backdrop-filter` 塌成 `none`。

### 落地

```css
[data-dsh-glass-float] [data-composer-card],
[data-dsh-glass-compat] [data-composer-card] { --dsw-menu-backdrop-filter: none; }
```

（实际写在两条既有的卡规则里，避免出现同选择器的第二块规则 —— 那会让护栏的 `find` 抓错块。）

- **真菜单表面不受影响**：它们在 `[data-menu-material='translucent']` 上自己再声明一次
  （mica 是 blur 旋钮、compat 是 12px），是后代声明、更近，赢过卡这一层。护栏里专门钉了这条，
  否则哪天有人把表面声明删了，真实菜单会被一起剥掉 blur。
- **两种模式都做**：抹掉 composer 座位底板的那条规则（`[data-phase] [class*='composerSeat'] { background: none }`）
  本身不分模式，so 两种模式都把正文放到了面板背后。
- **只解决糊，不解决盖**：被顶栏 / 侧栏盖住那半依旧是层叠上下文的天花板，仍然只有 portal。

### 未验

- 真机：等 compact-suite 能在我们验的壳上挂起来（它现在需要 `useAnchoredPosition`），或报告人给出他那边的
  面板 computed 值再交叉；
- 卡内若还有别的插件用它自己的手写菜单（不带 `data-menu-material`）借这个 token，会跟着失去 blur ——
  这条是**已知取舍**，写在这里而不是当成 bug。

## 10. 为什么这块面板在本机复现不了（2026-11-16）

装 `dsh-compact-suite`（2.9.2 与 2.8.9 都试了，含维护者手动从 tgz 装、走插件页那条路）后，
`conversation.input.left` 一挂就崩：

```
TypeError: primitives.useAnchoredPosition is not a function
    at CompactChip (plugins/??dsh-compact-suite/client.js:977:32)
```

根因在 `app.asar` 自带的迁移文档里：`@deepseek-ai/dsh-client-ui-primitives` **removed** the
`useAnchoredPosition` value export（`Menu` 改用 `anchorRef` / CSS anchor positioning）。
逐版 grep `2.8.5 / 2.8.6 / 2.8.7 / 2.8.9 / 2.9.2` **五个版本都还在调这个 hook** ⇒ 在 `0.2.2-rc.3` 上一个都起不来。

⇒ 报告人那套组合（同为 `0.2.2-rc.3` + `2.9.2`）能跑起来，说明他那边与本机的差异还没定位到，
这条已回帖请他确认「chip 还在不在」。在他回之前，本节之后的结论一律按 replica 证据对待。

## 11. 真机验证与填充旋钮（2026-11-17）

§9 的证据只到 replica，本节把它补到真壳：官方桌面壳 `0.2.2-rc.3`、mica、DPR 1.5、视口 1707×1019。
方法不是装 compact-suite（§10 说了装不起来），而是**注入与 `.dcs-panel` 同构造的探针**——
`background: var(--dsw-menu-surface-fill)` + `backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%))`，
放进 `[data-composer-card]`，读 computed 并截图量像素（`.debug/real-verify/cdp.mjs` + `.debug/issue-41/metrics.mjs`）。

### 三条断言

| 断言 | 实测 |
|---|---|
| 卡内借用该 token 的浮层 | `backdrop-filter: none`，token = `none` ✅ |
| 卡外同构造浮层 | `blur(40px) saturate(1.5)` ✅（塌缩只发生在卡内） |
| 卡内 `[data-menu-material='translucent']` 表面 | `blur(5px)` ✅（自己声明更近，免疫） |

### 像素 A/B（真壳，截图非 replica 页）

| 区域 | 无面板 | stock `blur(40px)` | 皮肤 `blur(14px)` | `none` |
|---|---|---|---|---|
| 卡外（裸正文） | 16.475 · 100% | 0.020 · **0.12%** | 0.052 · **0.32%** | 8.943 · **54%** |
| 卡盒内（卡材质之后） | 3.250 · 100% | 0.021 · **0.6%** | — | 2.461 · **76%** |

两条推论：

1. **轴是 blur 本身，不是半径。** 40px 与 14px 是同一片灰，只有 `none` 回到能读。
2. **修复只救卡外那截。** 卡盒内的基线（3.25）本身只有卡外的 **19.7%** —— 卡自己的
   `::before blur(14px)` 已经吃掉 80% 高频结构，面板再怎么设都救不回来。420×320 的面板约 2/3
   露在卡盒上方，那部分才是本 PR 的收益；卡盒内那截要动属 #28 B 的取舍，不在本 PR 范围。

### 填充旋钮（`glass.cardOverlay`）

既然 blur 只有"开 / 关"两档，剩下的连续维度是**面板遮住背后多少**。`none` 下同一区域实测：

| 填充 alpha | detail | 占基线 |
|---|---|---|
| 0.45（stock） | 12.293 | 56% |
| 0.60 | 7.610 | 35% |
| 0.75 | 2.209 | 10% |
| 0.90 | 0.906 | 4% |

而**模糊开着时这个维度完全无效**：`blur(40px)` 下 α0.45 与 α0.90 分别是 0.349 / 0.355。

所以旋钮做在**填充**上、不做在半径上：

- `glass.cardOverlay` = 30–180（%），**100 = 宿主自己的菜单 alpha**，即 0.7.4 的观感；
- 实现是**乘数**而不是绝对 alpha：宿主 alpha 两套配色不同（浅 58% / 深 45%，见 `palettes.ts`），
  绝对值默认只能挑其中一套，另一套会被悄悄改掉；
- CSS 侧在两条卡规则里重建 `--dsw-menu-surface-fill`（`bg-layer-3` × 基准 × 旋钮），
  基准值与 `palettes.ts` 由 `tests/glass-css.spec.ts` 双向钉住。

### 陷阱：旋钮写在 `<html>` 上不生效，写在 `<body>` 上才生效（2026-11-17 实测）

`--dsh-glass-card-overlay` 是乘数，但它**不能只在 `<html>` 上写**：

| 写入位置 | 卡内借用 token 的面板 computed alpha |
|---|---|
| `<html>` 上写 1 → 0.5 → 1.8 | 0.45 → **0.45** → **0.45**（完全不重算） |
| `<body>` 上写 1 → 0.5 → 1.8 | 0.45 → **0.225** → **0.81**（正确） |
| 直接写在卡元素上 | 同样正确 |

即：**跨元素继承的未注册自定义属性，没有把「变化」传给后代里把它的 `color-mix` 权重**——
和 §「#25 失效传播」是同一族问题，只是这次跨了一层元素而不是经过中间变量。
`@property` 注册成 `<number>` / `<percentage>` 也**没能**修好（实测同样不动）。

生产路径本来就没事：`applySettings()` 会把每个旋钮**同时写 `<html>` 和 `<body>`**（`glass-layer.ts`
的镜像，原本是为标题栏 caption 同步），`<body>` 那一份正好落在声明 `--dsh-glass-menu-fill-base` 的元素上，
所以重算成立。**将来若有人删掉 body 镜像，这个旋钮会静默变成「只有刷新才生效」。**

## 12. 真插件终于挂起来了（2026-11-17 下午）：本地 shim 与真实面板实测

装 `dsh-compact-suite` **不等于启用**：包在 `~/.dsh/profiles/desktop/node_modules/dsh-compact-suite`（2.9.2），
但 `cordis.patch.yml` 里没有条目 ⇒ 宿主从头就没加载过它。§10 的「装不起来」有一半是这件事。

### 让它挂起来的一行补丁

崩溃点只有一个：`primitives.useAnchoredPosition`（§10）。该返回值只被展开成样式：

```js
style: Object.assign({}, position, { position: 'fixed', zIndex: 60 })
```

所以在 `lib/client.js` 的调用点加个守卫即可（`primitives.useAnchoredPosition` 不存在时退化为固定 0,0，
面板位置由 `.dcs-panel` 自己的 CSS 兜住，本机实测落点正常）：

```js
const position = (primitives.useAnchoredPosition ?? (() => ({ left: '0px', top: '0px' })))({ … })
```

⚠️ 这个补丁**打在安装目录里**，`pnpm add` / 重装会清掉。重打脚本：
`node .debug/real-verify/reapply-compact-shim.mjs`（幂等；`--revert` 还原，备份是 `lib/client.js.orig`）。

### 真实面板实测（官方壳 0.2.2-rc.3 / mica / DPR 1.5）

面板 `420×409`，**`card.contains(panel) === true`** —— 即 `.dcs-panel` 确实是 `[data-composer-card]` 的后代，
§9 那条规则的前提从「按结构推定」变成实测。

`detail` 取面板顶部「背后有占位符文字」的那条 280×30 条带（越接近 0 越糊）：

| 状态 | 面板 computed | 背后文字 detail |
|---|---|---|
| stock `blur(40px)` | `blur(40px) saturate(1.5)` | **0.009** —— 文字彻底消失 |
| #43 修复 | `none` | **5.571** |
| 修复 + 实度 50% | `none`，alpha 0.225 | **7.871** |
| 修复 + 实度 180% | `none`，alpha 0.81 | **1.915** |

截图：`.debug/issue-41/real/dcs-{before,fixed,a50,a180}.png`。

⇒ 至此 #41 的「材质那半」不再是 replica 证据：**真插件、真壳、真面板**。仍未解的是层叠那半
（被顶栏/侧栏盖住），那只有插件 `createPortal` 到 body 能解。
