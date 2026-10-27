# issue #28：输入框下的状态栏缺少背板，滚动正文穿透

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/28>（2026-10-16，无标签）
- 状态：**已实施（方案 A），`0.6.3-beta.3` 首发 beta（2026-10-18，Publish run `39109687611` success）
  → `0.6.3` 转正进 `latest`（2026-10-19）→ `0.6.4` 材质改磨砂幕布（issue #29）**。上游 issue 由
  **报告人 `TWFU-wcy` 于 2026-10-19 自行关闭**（`stateReason=COMPLETED`，**关闭前 0 条评论**）。
  改动 = `src/client/glass/glass.module.css`（dock 背板带）+
  `tests/glass-css.spec.ts`（两条护栏）。方案 B（卡与 dock 合成一个圆角矩形 + 中间分割线，设为可开关项）
  **未实施、也未被否决**——报告人关闭只代表「A 对他有效」，B 仍需维护者拍板，见 §7。
- ⚠️ **§3 决定 3（「不加 backdrop-filter」）已被 [issue #29](./issue-29-dock-glass-veil.md) 推翻并重写**：
  #28 的实色带子在 `0.6.4-beta.0` 换成「同色 α70~84% + blur + 顶部 mask 淡入」。下文保留当时的理由与
  取证，读的时候按 #29 那份对齐。
- 报告环境：未提供（风味 / 模式 / 宿主版本都没写）。本机壳 = 官方桌面壳 `0.2.1-rc.2`。

## 1. 现象

> 对话框底部的状态栏（显示模型、上下文用量等信息的那条）完全透明，没有自己的背景层。
> 往上滚动历史消息时，消息正文直接穿过状态栏区域，两行字叠在一起。

预期：状态栏的读数是可读的，滚动内容不得与它重叠。

## 2. 根因

不是漏写，是**删得太多**。

| 层 | 事实 |
|---|---|
| 上游 | `[data-phase=active] .composerSeat` 自带一条背板：`background: linear-gradient(180deg, color-mix(bg-base 0%), var(--dsw-alias-bg-base) 36px)`，`position: sticky; bottom: 0`；overlay 模式下改 `position: absolute; bottom: 0`。0.2.0-rc.2 与 0.2.1-rc.2 一致（`dsh-client-ui-conversation/lib/client.js`，`ConversationRoot.module.css`） |
| 结构 | `composerSeat > [data-dsh-glass-inputbar]`.root > [`[data-composer-card]`, `.dock`] —— **dock 在卡外面，但仍在座席内**，`z-index: 7` 压在转录流上方 |
| 本皮肤 | `[data-dsh-glass] [data-phase] [class*='composerSeat'] { background: none }`（自插件 0.2.0 / 2026-08-16 起）—— 为了让卡「整块浮在地面上」而抹掉上游背板 |

于是：卡本体有玻璃挡得住，**卡外的 dock 行 + 根节点的 4px 底部内边距全部裸奔**，正文穿过。
这条规则一直在，只是长期没人把会话滚到「正文正好压在状态栏那一行」，所以到 #28 才被报。

## 3. 修法（方案 A）

给 dock 行挂一条**地面色渐变带**，锚在 dock 自己身上：

```css
[data-dsh-glass] [data-phase] [data-dsh-glass-inputbar] > [class*='dock']::before,
[data-dsh-glass] [data-phase] [data-dsh-glass-inputbar] > [data-composer-dock]::before {
  left/right: calc(-1 * var(--dsh-composer-side-clearance, 16px));  /* 全宽出血到座席边缘 */
  bottom: -4px;                 /* 盖住 root 的底部内边距 */
  height: calc(100% + 12px);    /* 8px 头骑进卡底阴影 */
  z-index: -1; pointer-events: none;
  background: linear-gradient(180deg, transparent 0, transparent 2px,
    color-mix(in srgb, var(--dsh-glass-ground), #000 calc(5% * var(--dsh-glass-ambience))) 8px, … 100%);
}
```

四个设计决定：

1. **锚 dock，不锚座席底部**。座席底部起步要猜「dock 有多高」；锚 dock 则高度自适应，
   且 dock 为空（hero 的 `:empty`）时带子只剩一条贴地细线，叠在地面上不可见 —— 不需要 `:has()` 守卫。
2. **只在卡下方**。带子的 8px 头骑进卡底，被卡的 `0 8px 24px` 阴影吃掉接缝；卡内磨砂与
   「透字」观感不变（对比过：上游那种覆盖整个座席的不透明板会让卡底失去霜感）。
3. **~~不加 `backdrop-filter`~~ —— 已被 issue #29 推翻**。#28 当时的理由是「填充 = 地面色，与上游同一思路；
   issue #13 的预算只为『覆盖移动内容且需要霜感』的面付费，这里已经是实色」——**后半句自相矛盾**：这条带子
   压着的正是滚动的正文（否则 #28 不会发生）。真实理由只是「实色填充 ⇒ blur 看不见」。报告人在 #29 里要求
   材质统一，于是 `0.6.4-beta.0` 起改成「同色 α70~84% + blur + mask 淡入」，全量见
   [issue-29-dock-glass-veil.md](./issue-29-dock-glass-veil.md)。
4. **取色跟地面渐变末端同公式**（`mix(ground, #000 5% × ambience)`），否则页面最底部会读出一块略亮的矩形；
   亮度拉满时 `--dsh-glass-ambience` → 0，带子自动塌缩成纯白 / 纯黑，与地面一起归一。

选择器用 `[class*='dock']`（两版都是 `InputBar.module.css` 的 `.dock`，哈希类名）+ `[data-composer-dock]`
（0.2.1 新增的属性）双写；`[data-dsh-glass-inputbar]` 是本仓库的接缝（`glass-seams.ts`，`:has(> [data-composer-card])`）。

## 4. 边界与已知残留

- **左右 16px 沟槽**（卡与座席边缘之间的 `--dsh-composer-side-clearance`）在卡身高度范围内仍是透的 ——
  上游用覆盖整个座席的不透明板遮住了它，本皮肤故意不遮（那会让卡不再浮起）。这是既有观感，不是 #28 的范围。
- **hero 视图**：dock 常为空，带子不可见；非空时涂的也是地面色。
- **关闭玻璃**：整条规则挂在 `[data-dsh-glass]` 下，off 状态零影响。
- **轨迹视图**：座席是否仍在渲染未实测；带子只画在地面色上，即使出现也不会盖住轨迹面板（面板在座席之上）。

## 5. 验证

| 项 | 结果 |
|---|---|
| `tests/glass-css.spec.ts`（新增两条：「座席保持零绘制」「dock 带子存在且不骑卡 / 不带 blur / 全宽出血 / 取地面色」） | 51 passed |

> 上表是 **#28 当时**的取证。#29 之后第二条断言已翻面：现在锁的是「带 blur + α 下限 + mask 坡 + 取地面色」。
| 变异（把带子选择器改废） | 红（`issue #28: the dock lost its backing …`） |
| `tsc` 两个 tsconfig | 通过 |
| `tsdown`（`gen-glass-css` 重出 `glass-css.gen.ts`） | 通过 |
| 全量 `vitest run` | **324 passed / 20 files** |
| 真机结构（官方壳 `0.2.1-rc.2`，CDP） | 座席 `position: sticky` / `z-index: 7` / `background: none`；`[data-dsh-glass-inputbar]` 的子节点正是 `[card, dock]`；dock 盒高 26px |
| 真机计算值（带子） | `::before` = `absolute` / `z-index:-1` / `height:38px`（= 26 + 12）/ `bottom:-4px` / 渐变首段不透明色 `color(srgb .0633 .0633 .1006)` |
| 真机取色 | 左侧沟槽页地面与带子同为 **rgb(17,17,27)（Δ0–1）** |
| 真机复现帧（带子关闭 = 修复前） | 正文确实压在 dock 行上（`.debug/issue-28/live-dock-overlap.png`，scrollTop 120） |
| 真机同位置 ON 帧 | **未取到**：桌面壳进程在取证途中被环境回收，无法复拍 |
| 四风味 × mica/compat × 亮度 0/50/100 截图 | **未跑** |

模拟图（非真机，A 的配方与仓库逐字一致）：`.debug/issue-28/compare.html` → `compare.png`（三联全窗）/ `zoom.png`（底部 1:1 三联）。

## 6. 待报告人确认

issue 里没写环境，回帖时需要问：风味 / 玻璃模式（mica 还是兼容）/ 宿主（web 还是官方桌面壳）/ 版本。

## 7. 方案 B（未实施）

维护者 2026-10-17 定形：**卡 + dock 合成一个圆角矩形、中间一条分割线，并做成设置里的开关（默认关 = 本节 A 的观感）**。

完整实施方案见 **[docs/issue-28-fused-composer-plan.md](./issue-28-fused-composer-plan.md)** —— CSS 草案、
六处联动清单（`state.ts` / `settings-catppuccin.ts` / `glass-layer.ts` / `state-sync.ts` / `glass-row.tsx` / 7 份字典）、
测试与变异、风险（`:empty` dock、外框宽度、backdrop root）、工作量（约 3–4 小时）。

口径：A 是修复 → `0.6.x`；B 是特性 + 新设置项 → `0.7.0`。


