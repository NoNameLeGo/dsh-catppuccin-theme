# issue #31 — 云母模式「卡片间距」滑条

> ⚠️ **编号说明**：上游 GitHub #31 是这条建议；本文文件名带 `gh-` 前缀，因为
> `docs/issue-31-theme-switch-echo-race.md` 用的是**内部编号 #31**（那份写的时候上游还没有 #31，
> 内容是「快速切风味时迟到的回声把主题回滚」，已随 `0.6.5` 修复）。两份文档不是同一件事。

## 报告

- 报告人 `aurasuisui`，2026-11-01，环境 `0.6.5` / 桌面版 / Mocha + mica + frost 65。
- 原文要点：「云母模式下卡片间距固定 12px，在我这块屏上略挤，换机器或缩放后观感差别也不小」
  → 要一个**滑条 4–24px**，外加**紧凑 / 标准 / 宽松**三档；**只**管悬浮卡与页面边缘的留白，
  **不改内容宽度**；**compat 模式保持原样**。
- 性质：**特性**（不是缺陷）⇒ 按 `AGENTS.md` 的版本规则走 `0.7.0`。

## 语义决定（先对齐，再实现）

| 问题 | 决定 | 理由 |
|---|---|---|
| 间距从哪来 | 从**侧栏列 / 卡片所在的列**里扣（`margin`） | 列宽是上游 inline 算好的，改列宽就是改内容宽度 |
| 内容宽度变不变 | **聊天列 / 阅读列不变**；侧栏卡**自身**随间距变窄 | 唯一可行解。间距 12→24 时侧栏卡窄 24px，正文区纹丝不动 |
| compat 模式 | 完全不受影响 | 六处消费者全部门控在 `data-dsh-glass-float`；设置里**同时隐藏**这个控件（否则是个推动不了任何东西的滑条） |
| 默认值 | **12** | 等于 `0.6.x` 的观感，未动过的配置逐像素不变 |

## 六个消费者（全部硬编码 12，一个都不能漏）

| 位置 | 规则 | 原值 → 现写法 |
|---|---|---|
| 侧栏玻璃卡 | `[data-dsh-glass-float] [class*='sidebarCol']` | `margin: 12px` → `margin: var(--dsh-glass-gap, 12px)` |
| 折叠窄轨 | 同上 + `[data-sidebar-collapsed]` | `margin: 12px -12px 12px 12px` → 右边改为 `calc(-1 * min(var(--dsh-glass-gap, 12px), 16px))` |
| 顶栏卡（展开） | `[data-phase] header:not([class*='headerBlank'])` | `margin: 12px auto 0` → `var(--dsh-glass-gap, 12px) auto 0` |
| 顶栏卡（折叠轨态） | 同上 + `[data-sidebar-collapsed]` | `margin-left: 28px` → `calc(var(--dsh-glass-gap, 12px) + 16px)`（28 = 12 + 16 的让位） |
| 轨迹视图卡 | `[data-dsh-glass-trajectory]` | `margin: 8px auto 12px` → 底边跟变量；`height: calc(100% - 20px)` → `calc(100% - 8px - var(...))` |
| 输入栏 | `[data-dsh-glass-inputbar]:not([class*='hero'])…` | `padding-bottom: 12px` → `var(--dsh-glass-gap, 12px)` |

**必须保持字面量的两个数**（挂了变量就是 bug）：

- `calc(100% - 32px)`（顶栏 / 轨迹的 `max-width`）——这是**阅读列的内边距**，即报告人要求不动的内容宽度。
- `padding-top: 107px`（`[data-phase='active'] [data-conversation-scroll]`）——这是「顶栏底边 → 正文」的让位
  （95px 卡片 + 12px 空气），不是卡片外边距。间距变大只是把整块往下推，正文与卡片的相对关系不变。

## 折叠窄轨为什么封顶 16px

窄轨的负右边距让它向右探出，探出量 = 间距值；而正文卡自己的左侧内边距只有 **16px**。于是：

| 间距 | 轨右缘与正文卡 | 结果 |
|---|---|---|
| 12（出厂） | 还差 4px | 不碰 |
| 16 | 正好贴住 | 临界 |
| 20 | 压过 4px | 文字被盖 |
| 24（上限） | 压过 8px | 明显缺陷 |

三种做法里选了**封顶**（`min(间距, 16px)`）：轨不会压到滚动文字。代价写在代码注释里——
间距 > 16 时，**折叠态**下轨的外框变宽 `间距 − 16`，聊天列随之右移同样距离（展开态不受影响）。
另外两个方案被否：① 照间距探（上限时压 8px，是可见缺陷不是审美偏好）；② 折叠态固定 −12（折叠瞬间正文横向跳动）。

## 状态链路（一个字段必须贯穿的全部落点）

`Knob / 三档按钮` → `GlassLayer.setGap` → localStorage `dsh.catppuccin.glass.gap` → snapshot →
去抖写设置文档（`stateToMutateOps` 的 `glass.gap`）→ `applySettings` 写 `--dsh-glass-gap`（html + body 镜像）→ CSS。

漏掉任何一处都是**静默**失效，历史已经演过两次（#26 漏 `stateToMutateOps`：开关一秒后自己弹回）：

| 落点 | 文件 |
|---|---|
| 类型 + 默认 + 归一化 + `isDefaultState` + `replayLocalChanges` + `settingsSectionsEqual` | `src/state.ts` |
| Host schema（两种缝共用一张字段表）+ `CatppuccinConfig` | `src/settings-catppuccin.ts` |
| 写文档的 mutate op | `src/client/state-sync.ts` |
| 运行时：读/写/夹取/applyRemote/reset/`GLASS_KNOB_PROPERTIES`/变量 | `src/client/glass/glass-layer.ts` |
| 设置行注入 + 控件 | `src/client/glass/glass-row.tsx`、`src/client/index.ts` |
| 7 语言文案 | `src/client/locales.ts` |

**`clampSetting` 的坑**：老写法是 `key === 'blur' ? 40 : 100`，min 恒为 0。间距是第一个**非 0 下限**的旋钮
（4–24），照抄会被夹成 `0–100`。现改为按 key 的 `NUMERIC_BOUNDS` 表。

**三档不能塞进材质预设**：`GLASS_PRESETS.find()` 只比对 blur/frost/brightness，把间距并进去会让
「只拖间距」把材质预设闪成「自定义」。间距三档是**另一个轴**（`GAP_PRESETS`，8 / 12 / 20）。

## 护栏

- `tests/glass-css.spec.ts` › `floating-card gap (issue #31)`：六个消费者都必须读变量；默认 12；
  窄轨必须带 `min(…, 16px)`；轨迹高度必须跟变量；`100% - 32px` 与 `107px` 必须保持字面量；
  compat 规则不得引用该变量。
- `tests/state.spec.ts`：4–24 夹取 + 非数字回落 12；漂移护栏（新字段必须同时有 mutant）。
- `tests/client.spec.ts`：从 section 自身推导叶子路径，漏 op 即红。
- `tests/glass-layer.spec.ts`：html↔body 镜像属性清单包含 `--dsh-glass-gap`。
- `tests/rows.spec.tsx`：mica 下有三个滑条 + 三档；compat 下滑条与分组**都不存在**。

## 未做 / 残留

- **真机视觉复核未做**（本机并行有其它改动在进行，启动桌面壳会读到工作区半成品）。
  需要在默认 4 / 12 / 24 三档各拍 mica 一张、compat 一张，确认 compat 逐像素不变、折叠轨不压字。
- 折叠轨的 `margin` 有 150ms 过渡：折叠态下拖滑条会有一点拖尾（属可接受的动画副产物，未特殊处理）。
- 报告人若认为「侧栏卡变窄」也不可接受，则本条需求需要重新设计（那就得动上游列宽，与本条约束冲突）。
