# issue #40 — 插件页 sticky 页头是一条不透明的 `bg-base` 白带

报告：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/40>（`aurasuisui`，2026-11-14，正文 + 1 条跟帖）
环境：插件 `0.7.0` + 官方桌面壳 `0.2.2-rc.3`（Windows 11）、Latte、玻璃开、云母、
blur 12 / frost 45、光斑 150%（尺寸 250%）
目标版本：`0.7.4`（修复按 `AGENTS.md` 的版本号规则走 `0.7.x`）

## 症状

「设置 → 插件」面板顶部那块 sticky 页头（标题 + 刷新/添加插件 + 已安装/插件市场/发现 三个 tab）
是一整块不透明的白带，下面才是玻璃的氛围地面；交界是一条硬边，滚动时正文从下沿「穿出来」。
会话页没有这个问题（那边的页头是玻璃卡）。

跟帖补充两个同族例子：

| 页面 | 采样（内容列 x=1185，视口 1646×1028） | 结论 |
|---|---|---|
| 自动化任务（官方 `dsh-client-ui-schedule`） | y=150…1200 全部 `239,241,245` (`#EFF1F5`) | 整页平色 `bg-base`，同屏侧栏卡 `230,236,245`（吃到了地面） |
| 上下文洞察（第三方 `dsh-context`） | 同上，仅统计卡 `205,208,219` | 不透明底来自宿主给的视图容器（插件源码里没有该规则） |

三例的共同点不是配色错了，是**同一屏里有两套底色基准**：会话页/侧栏透出地面，这几页是纯 `bg-base`。

## 取证（`app.asar` 0.2.2-rc.1，源码级，未上真机）

`dsh-client-ui-plugin-manager/lib/client.js`（`PluginManagerPage.module.css`）：

```css
.…_pageBody > .…_pageBar[data-natural] { position: sticky; top: 0; z-index: 2; pointer-events: none }
.…_pageBar[data-natural]::before {
  content: ""; position: absolute; inset: 0 0 auto;
  height: var(--plugin-header-paint-height, var(--plugin-header-rest-height));
  background: var(--dsw-alias-bg-base);          /* ← 白带 */
}
.…_pageBar[data-natural][data-compact]::after {
  content: ""; position: absolute; top: 0; height: var(--plugin-header-compact-height);
  border-bottom: .5px solid var(--dsw-alias-border-l3);
}
```

`header-scroll.js` 每帧重写高度：`--plugin-header-paint-height = max(compactHeight, restHeight - scrollTop)`，
并在 `data-measuring` 阶段把 bar 克隆进页面量两侧布局。**这条带子的高度是随滚动变化的**，不是静态值。

**这套机制是 0.2.2 新加的**（报告人的猜测成立）：本地 `versions/0.2.1-rc.5` 的同一包里
`pageBar` / `data-plugin-bar` / `plugin-header-paint-height` 命中数均为 0。所以：

- 0.2.1 上根本没有这条带 ⇒ 规则**静默不匹配**就是正确答案，不是漏适配；
- 本仓库 `0.7.3` 对这块面 0 命中（`glass.module.css` 只在 #21 的注释里提过 `pageHead`）。

## 座位：上游已经给好，不必走报告人的建议 C

| 钩子 | 挂在哪 | 上游自己用它吗 |
|---|---|---|
| `data-plugin-bar` | bar 根（`0.2.2+`） | **不用**（整包 CSS 零命中） |
| `data-natural` / `data-compact` / `data-scrolled` | bar（`header-scroll.js` 切换） | 用（sticky / 紧凑 / 已滚） |
| `data-plugin-header-part` | title / intro / toolbar / tabs 四块 | 用（测量与位移） |
| `data-plugin-body` | 滚动容器 | 不用 |

所以「上面两条修法都得靠 `[class*='pageBar']` 子串」这个前提不成立 —— 报告人提的 C（让上游给稳定
`data-*`）当下已经满足。规则用 `[data-dsh-glass-float] [data-plugin-bar][data-natural]::before`，
不带任何 hashed class 子串（#17 / #21 退场的那类写法），特异性 `(0,3,0)` > 宿主的 `(0,2,0)`，
不需要 `!important`。

## 配方：走 #29 的 dock，不照抄报告人的 A

报告人的 A 是 `background: var(--dsh-glass-card)` + `blur(--dsh-glass-blur)`。方向对（材质化，而不是
B 的「抹掉填充让正文压字」），但**两处取值在他自己的风味上就会翻车**：

1. `card` 是 `layer-1 @ α`：Latte 上 layer-1 === bg-base，看不出来；**dark 风味 layer-1 在 base 之上**
   ⇒ 换成一条比地面更亮的带子，同一个 bug 换了个方向。
2. 52% × frost 低于 `#29` 记下的 **70% 下限**：出厂 clear 预设 `blur: 0`，低于它就是「正文直接压到页头
   文字下面」——正是 B 的代价。

所以填充仍然是**地面色**（裸地面上不可见，只有内容真经过时才显形），α 从 70% 起随 frost 上升：

```css
[data-dsh-glass-float] [data-plugin-bar][data-natural]::before {
  background: color-mix(in srgb,
    color-mix(in srgb, var(--dsh-glass-ground), var(--dsh-glass-wash-tint)
      calc(var(--dsh-glass-wash-mix) * var(--dsh-glass-ambience)))
      calc(70% + 10% * var(--dsh-glass-frost, 1)), transparent);
  backdrop-filter: blur(var(--dsh-glass-blur, 14px));
  mask-image: linear-gradient(180deg, black calc(100% - 12px), transparent);
}
```

四个决定：

- **取 wash 的「亮端」，不是 `--dsh-glass-ground`**：这条带在滚动区**顶部**，那里的 165deg wash 最浅；
  dock 取的是**暗端**（`+5% black`），因为它贴在页面底边 —— 照抄会在 dark 风味静止时留下约 7/255 的带子。
- **两个加权都内联在 `background` 里**：#25 的失效传播陷阱，经过中间 custom property 的加权不随旋钮重算。
- **blur 合法**：按 #13 的谓词，列表就是从这条带下面滚过去的，这正是带子存在的理由（与 dock 同判）。
  模糊只挂在伪元素上，bar 本体保持零绘制 ⇒ 不成为 backdrop root / 包含块（#19 / #33）。
- **底部 12px 渐隐**：`paint-height` 每帧重写，不渐隐就是一条随滚动往上爬的硬切；`mask` 同时削填充和模糊
  输出（与 dock 同机制）。12px 是折中：读得出「融化」，又不吃掉 tab 行（它正好在带子底边）。

**不碰**：`height` / `inset` / `position` / `content` / `pointer-events` 全归宿主；`::after` 是宿主的紧凑态
发线，一条都不改。

## 同族第二问：他给了两条路，按他倾向的做了第 2 条

报告人在跟帖里请维护者定：「统一透明」还是「显式承认不透明 + 对齐地面平均色」，并说他倾向后者。
这里按他的倾向落地，但**不是**手搓一个「平均色」：那等于在 body 的 wash 上再叠一条自己算的渐变，
两层起点/终点/盒高都不同 ⇒ 又一条新接缝。

实际做法是把 `dsh-client-ui-schedule` 的页面根**并进 body 那条地面声明的选择器列表**：

```css
[data-dsh-glass] body,
[data-dsh-glass] [data-dsh-glass-ground-sample],
[data-dsh-glass-float] [data-testid='task-manager-page'] { background: <wash + 两道可选光斑> }
```

- 同 wash、同光斑、同旋钮 ⇒ 像素与周围地面一致，「两种白」消失；页面仍然**持有一块实底**（“不做真透明”
  这条语义保住了）。
- 座位是 `data-testid="task-manager-page"`（该组件唯一稳定钩子；class 是 hashed，`ctx.layout` 的 panel id
  `schedules` 不进 DOM）。它是**测试钩子**，属软座位：上游若摘掉，页面退回平色板（温和回归），护栏先红。
  回帖里已请上游在 `data-plugin-bar` 旁边补一个正式 `data-*`。
- 只挂 float：compat 保留宿主实底（#37 政策），它的 `centerCol` 本来就是 `bg-base`，画地面反而是 #37 修掉的那种错配。

**上下文洞察那页没做**：它有同样的采样证据，但报告人自己也只定位到「来自宿主给的视图容器」，没找到具体元素。
不能靠 `[class*='_root']` 去猜（那是 #17 退场的手法）。回帖里给了探针口径：从视图根逐级上溯读
`getComputedStyle(el).backgroundColor`，找出第一个不透明祖先；确认是宿主容器后，按「页级板」这一族一次性处理。

## 残留 / 待验收

- [ ] 真机（报告人环境：Latte + 云母 + blur 12 / frost 45 + 光斑 150%/250%）：带子上沿、下沿各 20px 采样对比；
      滚动中带子下沿是否还有可见硬切。
- [ ] 静置时光斑区域仍有 ≤30% 的压暗（填充 α70%），这是「实底 vs 真透明」的必然残留；若真机上仍读得出软边，
      退到 `[data-scrolled]` 门控（滚起来才上材质）。
- [ ] 紧凑态（`data-compact`）下 tab 行底部 12px 落在渐隐带里，确认不会读出「正文从 tab 底下透上来」。
- [ ] 4 风味 × 云母/兼容：compat 必须逐字节等于 stock（规则不匹配）。
- [ ] 性能：插件页滚动时与 dock 一起测帧率（全宽 `backdrop-filter`）。
- [ ] 自动化任务页：4 风味 × 光斑 0/200% 采样，确认内容列与侧栏卡同色；密集数据页（上下文洞察）如跟进，按
      `docs/legibility-sweep-2026-11-07.md` 的口径复测对比度。

## 护栏

`tests/glass-css.spec.ts`：

- `describe('plugin page sticky band (issue #40, 2026-11-14)')` —— 5 条：座位（float 门控 + 只用 data 钩子 +
  无 `class*=`）、填充（不含 `bg-base` / 不含 `--dsh-glass-card` / 取 wash 亮端 / 加权内联）、70% 下限 + frost、
  blur + 底部 12px 渐隐、不重述宿主几何且不碰 `::after`。
- `describe('schedule panel rides the ground (issue #40 follow-up, 2026-11-14)')` —— 2 条：座位并进 body 那条
  声明（且只有一条 background）、float-only。
- `GROUND_ONLY` 正则加 `task-manager-page`：那块板**就是**地面，将来谁给它加 blur 会直接变红（#13 谓词）。

## 第二轮（2026-11-16，目标 `0.7.5`）：v1 为什么失败 —— 用常量近似了一个场

报告人复验 `0.7.4` 后仍然看到白带，并给出决定性判据：**关掉光斑就没有白带**。

### 根因

v1 的填充是**单一平色**（`--dsh-glass-ground` ⊕ `--dsh-glass-wash-tint` 22%，α 70~79%）。它只等于「wash」，
**不含** body 地面声明里的两枚 radial 光斑；而两枚光斑的圆心（`at 18% 6%` / `at 86% 14%`）
**正好落在这条带子的盒子里**（带子高 ≈ 页面顶部 13%，圆心在 6% / 14%）。
即：光斑开着时，带子所在位置是全页最「脏」的地方，而它的填充恰好把那两层整个丢掉。

| 光斑 | 地面横向变化 | 常量填充的残差 |
|---|---|---|
| 关 | 只有 wash，≤2/255（#26 实测） | ≤2/255 ⇒ 看不见（= 报告人的观察） |
| 150% / 250% | 实测 ~9/255（右）~20/255（左） | 一条「左蓝右白」的板 |

α 只能稀释、mask 只能抹边：12px 渐隐治的是**硬线**，不是**色差**；`backdrop-filter: blur()` 对低频场是恒等
（#13 自己的实测），连安慰作用都没有，只多付一条全宽 backdrop read。v1 文档里「静置时 ≤30% 压暗」的估计，
方向也判反了——带子比地面**亮**，不是暗。

### 无头 Chromium A/B（可复现口径）

1600×700、DPR 1、光斑 150%/250%、真实三层地面表达式，三个变体：A = v1 平色填充；
B = 候选（同一片场 + `background-attachment: fixed` + 不透明）；C = 完全没有带子。
整个带子矩形按 4px 网格采样（20736 点）：

| 变体 | max ΔRGB | mean ΔRGB | >3/255 的像素 |
|---|---|---|---|
| A（`0.7.4`） | 79 | 63.04 | 20736 / 20736 |
| B（`0.7.5`） | **0** | **0.00** | 0 / 20736 |

### 修法

1. 带子的 `background` **逐字等于** body 那条地面声明（三层：两道光斑 + 165deg wash），
   由 `normalize(bandBg) === normalize(groundBg)` 护栏锁死漂移；
2. 加 `background-attachment: fixed`：渐变按**视口**取样，带子多高都不影响 ⇒ 它画的就是地面在该屏幕位置的那些像素。
   这正是它和「自动化任务页」的差别：那页的盒子 ≈ body，可以直接复用声明；带子只有 ~129px，复用会把 wash 压扁；
3. **不透明**：既是隐形（同色），又比 α70 更彻底地挡住滚动内容 ⇒ #29 的 70% 下限对它不再适用，反而更安全；
4. 删 blur 与 mask：没有可模糊/可渐隐的东西了；
5. 自动化任务页同样加一行 `background-attachment: fixed`（同一病理：盒子不是 body 尺寸 ⇒ 场被压缩/错位）。

### 取舍与风险（别当免费午餐）

1. **融化感没了**：v1 的内容从带子下沿「融」进去；v2 是「在带子下沿直接消失」，与 stock 一致。
   要保留融化得另做材质，属特性不属修复。
2. **`background-attachment: fixed` 的成本未测**：换掉了一条全宽 `backdrop-filter` 的每帧回读，
   但 fixed 背景在滚动容器里可能逼主线程重绘。**必须真机测滚动帧率**（见残留 1）。
3. **「视口」假设**：靠的是「文档本身不滚动、body 盒 == 视口」。若宿主将来让文档可滚，fixed 会与地面错位。
4. **两份拷贝**：body 与带子各一份三层表达式（不能走 custom property —— #25 的失效传播陷阱）。护栏锁漂移。
5. **不再读 frost / blur 旋钮**：带子只随「地面」变。这是对的（它就该等于地面），但行为变了。

### 残留（v2）

- [ ] 真机滚动帧率 vs `0.7.4`（fixed 背景的代价）
- [ ] 4 风味 × 云母/兼容逐像素：compat 规则不匹配、必须等于 stock
- [ ] 密集数据页（上下文洞察）仍待定位（同 v1）
- [ ] macOS / Linux 壳未验

### 护栏（v2）

- `plugin page sticky band` —— 4 条：座位；**场相等（漂移护栏）+ 两层 radial + 一层 165deg**；
  `background-attachment: fixed`；无 blur / 无 mask / 无 70% 残项；不碰宿主几何。
- `schedule panel rides the ground` —— 3 条：并进 body 声明、**视口锚定且不重复声明 background**、float-only。

> 上文「残留 / 待验收」与「护栏」两节描述的是 **v1**；第 2 项（α70% 软边、`data-scrolled` 门控）已作废，
> 以本节为准。
