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
