# issue #25 分析与修复方案：纯色地面下玻璃层失去层次感（背景氛围层）

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/25>（报告人 `TWFU-wcy`，2026-10-15）
- 状态：**已实施（方案 L2，2026-10-15）+ 本机 CDP 验证通过；`0.6.3-beta.0` 首发（与 issue #24 同批）
  → `0.6.3` 转正进 `latest`（2026-10-19）**。后续 **issue #26 把光斑改为默认关**（wash 常驻、光斑可选），
  见 CHANGELOG `0.6.3`。上游 issue 由报告人 `TWFU-wcy` 于 2026-10-15 自行关闭。实施记录与两处草案偏差见 §10。
- 报告环境：`dsh web`、主题 `@nonamelego/dsh-catppuccin@0.6.2-beta.2`；未写风味（示例为 Mocha）。
- 关联 issue：**#24**（同一报告人：切换会话时 blur 闪烁）——已另案定位并修复（`docs/issue-24-switch-flicker.md`，commit `918f18b`）：闪烁来自「会话根重挂载 ⇒ 入场动画重播」，**与 `backdrop-filter` / 合成层无关**。本方案 L1/L2 不动任何 blur 与合成层，与 #24 零交互（详见 §8）。
- 写作/实施时树状态：写作时 HEAD `679a5a2`；实施时 HEAD `918f18b`（#24 修复已提交）。

> ⚠️ 本文的 `文件:行号` 是写作当时（2026-10-15）的快照——代码一动行号就漂。
> 按位置找代码请用**选择器 / 符号名**（`[data-dsh-glass] body`、`--dsh-glass-brightness-*`、`dsh-glass-in`）检索。

---

## 1. 现象与非题

### 1.1 报告人的描述（成立）

玻璃开启、页面只有纯色地面时：

- 玻璃面（顶栏卡 / 输入卡 / 侧栏 / 气泡）与页面的**填充差异接近不可见** → 「像同一块颜色」；
- 玻璃的「通透感」消失——背景没有任何内容可以透出或被模糊。

### 1.2 报告人的自诊断（方向正确，但有一条技术假设不成立）

他给出的三要素模型与本插件现状的对照：

| 玻璃质感要素 | 本插件现状 | 结论 |
|---|---|---|
| ① 背后有内容可模糊 / 可透（渐变、明暗、动态） | **缺失**——地面是纯色 | 本 issue 的核心 |
| ② 玻璃自身的介质属性（半透明填充、saturate、噪点） | 半透明填充 / rim / 顶部内高光**已有**；**无 saturate**；无噪点 | 基本满足，可选加料 |
| ③ 前后景对比（边缘高光、投影） | rim / edge / drop 已有 | 满足，但缺少「背景明暗」这个对比对象 |

**不成立的假设**：报告人建议「光斑用极慢漂移动画，让 `backdrop-filter` 始终有持续变化的内容可模糊」。物理上 `blur(5–14px)` 对**几百 px 周期的柔和渐变**作用近似恒等——渐变太「低频」，模糊半径远小于波长。**「让 blur 有活干」不构成加动画的理由**；真正让玻璃「活」起来的是半透明填充透出背景的明暗变化（不依赖 blur）。动画的价值只有「背景观感在动」本身。

### 1.3 与本皮肤既有决策的关系（重要背景）

- **issue #13**（性能）：本皮肤把页面地面刷成纯色，因此「背后只有地面」的面上加 `backdrop-filter` 是恒等变换（实测 0/19184 像素差异），已有意**移除**气泡 / 侧栏 `::before` / 轨迹面板上的 blur（`glass.module.css` 各段注释、`tests/glass-css.spec.ts` 的 `GROUND_ONLY` 断言）。⇒ 报告人看到的「连名义上的模糊都没有」是**有意决策**，不是 bug。
- **2026-08-17（0.2.5-beta.0）**：维护者当时**主动**把「动态环境背景（渐变洗底 + 3 漂移 blob + 呼吸动画 + hue 旋钮）」替换为纯色地面（memory `2026-08-17.md`：「用户确认方案 A」；commit `d18601a`）。动机是简化 + 「零硬编码、切色板自动跟随」。
- ⇒ 本 issue 本质是**重新权衡那一次的取舍**：报告人建议的「渐变 + 光斑」≈ 当年删除的 ambient 的静态部分。这次修复 = **在保留「token 生成、四风味自动跟随」的前提下，选择性恢复静态氛围层**：不恢复 hue 旋钮，不默认恢复动画。

### 1.4 快速复现（约 1 分钟，可选）

1. 起 web GUI，玻璃开、默认配置（mica / blur 5 / frost 20 / brightness 50），进入任一会话页。
2. 观感：顶栏卡 / 输入卡与页面**无填充差**，仅靠 rim / 阴影区分出轮廓。
3. 量化（DevTools）：取顶栏卡内与卡外同 x 两点——Mocha 下 ΔRGB ≈ 2/255，Latte 下**完全相等**（§2.2 的成因）。

---

## 2. 根因（两层）

### 2.1 第一层（报告人已指出）：地面纯色 ⇒ 背后无内容可透 / 可模糊

`glass.module.css:106-110`：

```css
[data-dsh-glass] body {
  background: color-mix(in srgb,
    color-mix(in srgb, var(--dsw-alias-bg-base), #ffffff calc(var(--dsh-glass-brightness-white, 0) * 100%)),
    #000000 calc(var(--dsh-glass-brightness-black, 0) * 100%));
}
```

单一颜色，没有任何低频明暗。玻璃面的「通透」只能来自「透出的背景有变化」——没有变化，通透感归零。

### 2.2 第二层（报告人未提及，但数字上更致命）：玻璃填充与地面的色差本来就 ≈ 0

玻璃卡填充 = `--dsh-glass-card` = `bg-layer-1 × α`（默认 `frost 20` ⇒ α = 0.208；拉满 `frost 50` ⇒ α = 0.52）。用当前 token 表的真实取值算（`src/client/palettes.ts`；暗色 `bg-base` = `bluish-950`、`layer-1` = `bluish-875`）：

| 风味 | 地面 `bg-base` | 卡填充源 `layer-1` | 卡内 vs 地面 ΔRGB（frost 20, α=.208） | ΔRGB（frost 50, α=.52） |
|---|---|---|---|---|
| Latte | `#eff1f5` | `#eff1f5`（**同值**） | **0** | **0** |
| Frappé | `#232634` | `#292c3c` | ≈ 2 | ≈ 4 |
| Macchiato | `#181926` | `#1e2030` | ≈ 2 | ≈ 5 |
| Mocha | `#11111b` | `#181825` | ≈ 2 | ≈ 5 |

（ΔRGB = 单通道最大差；参照系：issue #22 曾把 ΔRGB ≤ 31 的 rim 判定为「1x 下不可见」。）

**读数**：默认配置下卡填充与地面的差只有 2/255；Latte 恒为 0（`layer-1 === bg-base`，这也是 compat 注释里「the rim is what carries the material in Latte」的同一根源）。⇒ 「像同一块颜色」不是错觉，是**可以从 token 数出来的数学事实**。玻璃的轮廓全靠 rim / edge / 阴影在撑。

### 2.3 合并结论

> 地面纯色（无内容可透）× 填充与地面同色（无可透的差）= 玻璃层只剩描边。报告人方案的主体（给地面加低频内容）**同时解决两层**：光斑使地面明暗变化 Δbg ≈ 15–30/255，卡内以透过率 (1−α) = 0.48–0.79 体现为 Δ ≈ 7–21/255，即回到「可见」区间；Latte 同样受益（不再依赖塌缩的 layer 色）。

### 2.4 附带确认的非问题

- 「玻璃关闭 = 原样」不受影响：所有规则由 `[data-dsh-glass]`（html 属性）门控，关闭即移除属性 + `<style>` 标签（`glass-layer.ts` mount/unmount），天然无残留。
- 本方案不新增 `backdrop-filter`，不引入新的合成层行为（#24 的机制不在此处）。

---

## 3. 修复方案（三档，逐档增强）

统一原则（全部满足硬规则 4 与项目定位）：

- 颜色全部来自**已映射的 `--dsw-*` token**（或其 `color-mix`），零硬编码 → 四风味与未来色板自动跟随；
- 玻璃关闭时该规则整体失效 → stock 原样；
- **不新增任何 `backdrop-filter`**（不加回 blur——见 §1.2：对低频渐变无效，且重新引入每帧 backdrop 回读）；
- 亮度旋钮语义保留：`--dsh-glass-brightness-*` 继续混进「底色」变量。

### L1 —— 同色系微渐变（最小改动）

地面从「一色」变成「两端差 ≈ 4–6/255 的斜向渐变」。效果：消灭「数学纯平」，但层次感增幅有限（卡内 Δ ≈ 2–4）。改动 ≈ 5 行 CSS。

### L2 —— L1 + 静态柔光斑（**推荐**）

两枚低 alpha 径向光斑（左上 brand、右上 success，均取主题 token）+ 同色系 wash。预估数字（**估算**，最终以 §7 实测为准）：

| 项 | 参数（起点值） | 地面 Δ | 卡内 Δ（frost 20 / frost 50） |
|---|---|---|---|
| 光斑 1（brand 主色，12% α，58%×46% @ 左上） | Mocha `#89b4fa` 12% on `#11111b` | ≈ (14, 20, 27) | ≈ (11,16,21) / (7,9,13) |
| 光斑 2（success 绿，10% α，48%×42% @ 右上） | 随风味 | ≈ 8–15 | ≈ 5–10 / 4–7 |
| wash（底 → 混黑 5%，165deg） | — | ≈ 2–5 | ≈ 1–4 |

- 零性能成本（静态多层背景，仅绘制一次）；不新增合成层。
- 观感目标：靠近光斑的玻璃卡（顶栏 / 输入卡）能看出「透过一层有色玻璃看柔光」，画面四角与中央有明暗差。
- **Latte 注意**：`layer-1 === base`，wash 的「亮端」不能用 layer 色（会塌缩为纯色），要用混白方案；见 §5.1 的双 scheme 变量。Latte 光斑实测预估 12% brand 蓝在地面上可产生 Δ ≈ (25,17,0)，同样可见。

### L3 —— L2 + 极慢漂移动画（可选，建议缓做）

- 形态：复用旧版思路（`transform` 合成动画 30–60s 往返 + `prefers-reduced-motion` 降级），**不引入 hue 旋钮**。
- 成本：1 个动画层（建议独立 fixed 层、旧版 `data-dsh-glass-ambient` 形态；纯 `body::before` 有层叠坑，见 §5.3）。
- 缓做的理由：① 收益是「背景在动」的观感，不是玻璃功能的必需（§1.2）；② 新增持续合成成本需独立验证；③ 与 `prefers-reduced-motion` 的用户预期要一起处理。**与 #24 无同源风险**（漂移层挂在 body 上、不在会话子树内，不受会话切换重挂载影响；也不新增 blur）。

### 交叉选项（独立于档位，可在 L2 起加料）

- **saturate**：带 blur 的面（顶栏 / 输入卡 `::before` / 菜单 seat 等 ~4 处配方）的 `backdrop-filter` 从 `blur(...)` 扩为 `blur(...) saturate(140%)`——背景有了彩色光斑后，saturate 才有东西可做（stock 菜单本来就是 `blur(40px) saturate(150%)`，我们在 issue #22 里把该 token 覆写成纯 blur）。独立验证；菜单 seat 的测试正则只匹配 `blur(var(--dsh-glass-blur` 前缀，加 saturate 不破坏断言。
- **微噪点**：报告人的「SVG 微噪声」建议——作为玻璃面自身的介质增强（不依赖背景），收益中等、需新增资产/CSS，**本轮不做**，登记为后续可选项。

### 档位对比

| | 观感收益 | 改动面 | 性能 | 风险 | 建议 |
|---|---|---|---|---|---|
| L1 | 小（消灭纯平） | ~5 行 CSS | 零 | 极低 | 可作 L2 的降级版 |
| **L2** | **中（恢复层次）** | **~25 行 CSS + 测试/文档** | **零** | **低（审美迭代）** | **推荐** |
| L3 | 中+（背景会动） | +动画层与降级逻辑 | 1 个合成动画层 | 中（性能/审美） | 缓做 |
| saturate | 小+（玻璃增艳） | ~4 处配方 | 零（同一次 backdrop 读取） | 低 | 可选加料 |

---

## 4. 涉及文件与代码位置（实施清单）

| 文件 | 位置（写作时快照） | 改什么 |
|---|---|---|
| `src/client/glass/glass.module.css` | `:98-110`（「Canvas: a SOLID ground」注释 + `[data-dsh-glass] body` 背景规则） | **核心**：纯色 → 多层背景（wash + 光斑）；把亮度 mix 抽成 `--dsh-glass-ground`；新增 `--dsh-glass-ambience`（纯 CSS 由亮度变量算出，见 §5.1）；注释整段重写 |
| 同上 | `:39-96`（双 scheme 变量块） | 新增 `--dsh-glass-wash-top`：light 块混白、dark 块混 `bg-layer-1`（见 §5.1 草案） |
| 同上 | `:1058-1064`（reduced-motion 块） | **仅 L3**：动画降级 |
| `src/client/glass/glass-css.gen.ts` | — | 生成物：`pnpm build`（先跑 `scripts/gen-glass-css.mjs`，lightningcss minify）后提交。**注意确认 minify 后 `color-mix(... calc(...))` 与多层 background 未被破坏** |
| `src/client/glass/glass-layer.ts` | `:10-14`（「The page ground is a SOLID colour…ambient scene was removed」注释） | 注释与实现同步（纯 CSS 氛围强度方案**无需改 JS**；若选 JS 侧衰减才动 `applySettings` `:380-400`） |
| `tests/glass-css.spec.ts` | `:9-18`（文件头「SOLID page ground」叙述）；`describe('glass blur budget')` 块 | 更新叙述；**新增护栏**：`[data-dsh-glass] body` 的 background 必须包含 ≥1 层 `radial-gradient` + ≥1 层 `linear-gradient`（把「地面有氛围层」锁成决策——以后谁改回纯色测试即红，提醒回看本 issue）；`GROUND_ONLY` / `VISIBLE` 断言**不变**（面不 blur 的决策未变） |
| `README.md` / `README.en.md` | 玻璃段「纯色背景跟随主题底色」处（中文 `:77` 附近、`:229` 附近） | 文案更新（「同色系渐变 + 柔光斑，随主题自动跟随」） |
| `assets/previews/glass-*.png` | — | 重拍玻璃预览（链路见技能 `dsh-preview-shots-cdp`；若与新背景不一致就换） |
| `AGENTS.md` | 硬规则 4 的推论段 | 更新：「地面 = 受控低频背景（wash + 光斑，token 生成）；『地面之上的面不加 blur』的结论**不变**（低频渐变对 blur 仍是近似恒等）」 |
| `CHANGELOG.md` | `## [Unreleased]` | 一条（含 ΔRGB 数字与英文摘要） |
| 版本 | — | 本项属**默认外观变化**（特性）：单独走建议 `0.7.0`；若与 #24（修复）同批发，本项即该批的版本下限 |

---

## 5. 实现草案（CSS 起点配方）

### 5.1 地面（替换 `glass.module.css:106-110` 的 body 规则）

```css
/* Canvas: a soft-lit ground (issue #25). A flat fill made every glass
   surface read as "the same colour as the page": the card fill is
   layer-1 @ α over bg-base, which measures ΔRGB ≤ 2/255 on the dark
   flavours at the default frost and is EXACTLY 0 on Latte
   (layer-1 === bg-base there). The glass needs something to TRANSMIT —
   a same-family wash plus two low-alpha glows, built only from mapped
   tokens so all flavours follow. The brightness knob still mixes into
   the base stop; `--dsh-glass-ambience` fades the ambience out as the
   brightness slider leaves neutral (keeps the 0.2.5 pure-white /
   pure-black promise at the extremes). */
[data-dsh-glass] body {
  --dsh-glass-ground: color-mix(in srgb,
    color-mix(in srgb, var(--dsw-alias-bg-base), #ffffff calc(var(--dsh-glass-brightness-white, 0) * 100%)),
    #000000 calc(var(--dsh-glass-brightness-black, 0) * 100%));
  /* 1 − |brightness−50|/50, purely in CSS: exactly one of the two
     brightness fractions is non-zero (glass-layer.ts), and each is 0
     at neutral. */
  --dsh-glass-ambience: calc(
    1 - var(--dsh-glass-brightness-white, 0) - var(--dsh-glass-brightness-black, 0));
  background:
    radial-gradient(58% 46% at 18% 6%,
      color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color)
        calc(12% * var(--dsh-glass-ambience)), transparent), transparent 68%),
    radial-gradient(48% 42% at 86% 14%,
      color-mix(in srgb, var(--dsw-alias-state-success-tertiary)
        calc(10% * var(--dsh-glass-ambience)), transparent), transparent 62%),
    linear-gradient(165deg,
      var(--dsh-glass-wash-top, var(--dsh-glass-ground)) 0%,
      var(--dsh-glass-ground) 55%,
      color-mix(in srgb, var(--dsh-glass-ground), #000000 calc(5% * var(--dsh-glass-ambience))) 100%);
}

[data-dsh-glass] body:not([data-ds-dark-theme]) {
  /* Latte: the layer ladder collapses to bg-base, so the wash's light end
     must come from mixing white (dark flavours ride bg-layer-1 below). */
  --dsh-glass-wash-top: color-mix(in srgb, var(--dsh-glass-ground), #ffffff 22%);
}

[data-dsh-glass] body[data-ds-dark-theme] {
  --dsh-glass-wash-top: color-mix(in srgb,
    var(--dsh-glass-ground), var(--dsw-alias-bg-layer-1) 68%);
}
```

要点：

1. **`--dsh-glass-ambience` 纯 CSS 实现**（`glass-layer.ts:392-393` 保证 dark 时 white 恒 0 / light 时 black 恒 0，恰好一个非零）→ 亮度拉满自动淡出氛围，复刻 0.2.5 的「纯白 / 纯黑」承诺，**不用改 JS**。若希望拉满时保留少量层次，可改 `max(0.35, calc(...))`（维护者定）。
2. 光斑色选 `brand-primary` + `state-success-tertiary`（均为已映射 token；旧 ambient 用的是 brand + success + warn 三色，第三枚底光斑可按需加回）。
3. `transparent` 的渐变停止在现代 Chromium 是 premultiplied 插值，无「褪向黑色」通病；仍建议 minify 后过一眼生成物。
4. 视觉参数（alpha 12% / 10%、半径、位置、wash 混比）是**起点值**，按 §7.4 的截图轮迭代——**一次只调一类参数**。

### 5.2 不做什么（防误伤清单）

- 不给气泡 / 侧栏 `::before` / 轨迹面板**加回 blur**（#13 结论不变：低频渐变对 blur 仍近似恒等，成本却回归）。
- 不引入新旋钮（报告人没要；hue 旋钮已在 0.2.5 删除，不复活）。
- 不动 `--dsh-glass-card*` 填充配方（本 issue 修的是「地面没有内容可透」，不是「填充太淡」——改填充会与 #22 的整套证据链打架）。

### 5.3 L3 的层叠注意（若做）

纯 `body::before` 做动画层有坑：`z-index:-1` 会被 body 自身背景盖住、`z-index:0` 可能盖住未定位内容——旧版用的是**注入独立层**（`div[data-dsh-glass-ambient]`，`position:fixed; inset:0; z-index:0`，见 `glass-layer.ts` 历史 `AMBIENT_MARKUP`）。若走 L3，沿用旧版注入层形态（`ensureFades` 同款机制），并重验层级（侧栏 9 / 顶栏输入卡 8 的现状不受影响）。

---

## 6. 可引用给报告人的事实（对账用）

- 「对话框、顶栏和背景像同一块颜色」在默认 frost + 暗色下是 ΔRGB ≈ 2/255 的事实（§2.2），Latte 下是恒 0——数字可对账。
- 「光斑 + 缓慢漂移让 backdrop-filter 有内容可模糊」——**对 blur 无效**（§1.2）；他方案的**主体（让地面有低频内容）有效**，修复采纳其主体、剥离其动画假设。

---

## 7. 验证步骤

### 7.1 构建与静态护栏（分钟级）

1. `pnpm build` → 检查 `glass-css.gen.ts` 重新生成（多层 background / `color-mix` + `calc` 未被 minify 破坏）。
2. `pnpm vitest run tests/glass-css.spec.ts`：现有断言全绿 + 新增「地面含渐变层」断言绿。
3. 变异验证（项目铁律）：临时把 body 背景改回纯色 → 新断言必须**红**；改回。

### 7.2 真机功能验证（CDP；本机无 Playwright，见 `AGENTS.md`）

1. 链接态 `pnpm build` + 重启壳（或 web profile）。
2. **四风味 × 玻璃开**：Latte / Frappé / Macchiato / Mocha 各截「新会话（hero）」+「会话（active）」两张；确认光斑与 wash 随风味正确换色、无硬编码色泄漏。
3. **玻璃关**：截图与 stock 一致（机制上是移除属性，抽查一遍即可）。
4. **亮度旋钮三档**：0 / 50 / 100——50 有氛围、两端退化为纯黑 / 纯白（若采纳 §5.1 的线性归零）。
5. **报告人配置复现**：mica、默认 blur 5 / frost 20 / brightness 50——「同一块颜色」现象消失；出改前 / 改后对比图。

### 7.3 像素与对比度（数值把关）

1. **卡内亮度差**：CDP 在页面里用 canvas 采样（或截图像素统计）——顶栏卡内 vs 卡外同 x 地面，四风味各取 3 点，目标卡内 Δ ≥ 5/255（frost 20）。
2. **文字对比度回归**：光斑最亮 / 最暗处的 `label-primary` 文字对底色对比度不得低于改前（AA 预算不侵占）；四风味抽查。
3. **无性能回退**：确认没有任何新增的 `backdrop-filter ≠ none`（DevTools 全量扫一遍）；如加 saturate，确认只是配方变化而非新面。

### 7.4 审美轮（截图迭代，1–2 轮）

- 每轮只调一类参数（光斑 alpha / 位置 / wash 对比），四风味同看；维护者拍板后冻结。

### 7.5 收尾

- 预览图重拍（若 `glass-*.png` 需要）；README 中英同步；CHANGELOG；版本号裁定；AGENTS.md 规则 4 推论更新；测试计数确认。

---

## 8. 风险、待决与关联事项

### 待决（维护者拍板）

1. **档位**：L1 / **L2（推荐）** / L3 缓做。
2. **亮度极端值**：氛围归零（复刻 0.2.5 纯白 / 纯黑承诺，推荐）还是保留 35% 下限。
3. **光斑参数**：数量（2 或 3）、位置、alpha、颜色（brand / success / warn 组合）——审美迭代时再定。
4. **saturate 加料**：加 / 不加（独立验证）。
5. **版本定位**：`0.7.0`（默认外观变化，建议）或与 #24 同批发时为其版本下限。
6. **是否回帖**（§9 要点）。

### 风险

- **审美主观性**：光斑强度是审美参数，报告人之外的用户可能偏好原味纯色——若上线后出现「背景太花」反馈，备选：把氛围强度接到既有旋钮上（不新增 UI）或提供关闭路径。
- **Latte 的特殊性**：layer 阶梯塌缩（三层同色）是本项目反复踩的坑（PP、compat rim 注释）；§5.1 已用混白规避，实施时以 Latte 截图把关。
- **#24 的关系**：其根因（会话根重挂载 ⇒ 入场动画重播）与本方案无交集；L1/L2 零交互。**注意**：#24 修复清掉的正是 `[data-phase='hero'|'active']` 两条动画，未来若有人想用「给 hero/active 加入场动画」的方法实现 L3 的背景淡入——不要，那会复活 #24。

---

## 9. 建议的 issue 回帖要点（供维护者改写）

1. 感谢 + 确认问题成立，附量化佐证：默认 frost 下卡填充与地面 ΔRGB ≈ 2/255（暗色）、恒 0（Latte）——「同一块颜色」可以从 token 数出来。
2. 说明本皮肤的既有决策：为性能（issue #13）有意移除了「背后只有纯色地面」的面的 blur——它不是遗漏。
3. 方案：按「同色系微渐变 + 静态柔光斑（token 生成、四风味自动跟随）」推进（即报告人建议的主体）；动画版受益有限（blur 对低频渐变近似恒等），按性能预算缓做。另：其姊妹 issue #24（切换会话闪烁）已一并修复（`docs/issue-24-switch-flicker.md`）。
4. 给出版本预期；请报告人在下一个 beta / 正式版后复测四风味。

---

## 10. 实施结果（方案 L2，2026-10-15）

### 改了什么（实际落地清单）

| 文件 | 内容 |
|---|---|
| `src/client/glass/glass.module.css` | `[data-dsh-glass] body`：纯色 → 多层背景（165deg wash + 两枚 radial 光斑）；新增 `--dsh-glass-ground` / `--dsh-glass-ambience` / `--dsh-glass-wash-tint` / `--dsh-glass-wash-mix`（light 混白 22% + `#ffffff`、dark 混 `bg-layer-1` 68%）；「Canvas」注释重写 |
| `src/client/glass/glass-layer.ts` | 头部注释同步（地面 = 氛围场；0.2.x 动态场景仍不复活） |
| `src/client/glass/glass-css.gen.ts` | 重新生成（14,210 bytes，lightningcss minify 后 `color-mix` + `calc` 完好） |
| `tests/glass-css.spec.ts` | 新增 `describe('ground ambience (issue #25)')` 3 条（多层背景 + token 光斑 / ambience 纯 CSS 派生与内联加权 / 双 scheme wash）；文件头与 `GROUND_ONLY` 注释同步 |
| `README.md` / `README.en.md` | 玻璃段 4 处 + 4 处（「纯色背景」叙述 → 氛围地面） |
| `AGENTS.md` | 硬规则 4：推论一修订（地面 = 低频场，blur 判定不变）+ 新增「#25 附带陷阱」（ambience 加权必须内联） |
| `CHANGELOG.md` | `[Unreleased]` → 「变更」一条 |

### 与 §5.1 草案的偏差（两处，都是实施时的新发现，实测证据驱动）

1. **wash 的加权必须内联在 `background` 里**：草案把 `calc(68% * var(--dsh-glass-ambience))` 存进 `--dsh-glass-wash-top` 中间变量——CDP 实测（`.debug/issue-25/probe-amb.js`）：亮度变量变化时该中间变量**不重算**（保持折叠后的旧值 68%），而 `background` 里直用的光斑正确塌缩（`0.12 → 0`）。⇒ 改为常量 `--dsh-glass-wash-tint` / `--dsh-glass-wash-mix` + 在 `background` 里做 ambience 加权。护栏已锁（ground ambience 第 2 条）。
2. **亮度极端的塌缩范围扩到整个 wash**：草案只让光斑与底部混黑随 ambience 收缩、wash 顶端不动——「拉满 = 纯白/纯黑」的承诺会破（复核时发现）。现 glows + wash（顶端 + 底端）全部随 ambience 塌缩，且测试锁定「加权表达式必须在 background 内直用」。

### 实测（CDP，web GUI + headless Chrome，1440×900@2x，mica + blur 2 + frost 20）

| 项 | 结果 |
|---|---|
| 计算样式（Mocha） | `--dsh-glass-ambience: calc(1 - 0 - 0)`；背景 = 2×radial（`#89b4fa 12%` + 深绿 10%）+ 165deg wash（`#161622 → #11111b`） |
| 计算样式（Latte） | 2×radial（`#1e66f5 12%` + 淡绿 10%）+ wash（`#f3f4f7 → #eff1f5`） |
| A/B 像素（ambience=1 vs 0，同页） | **Mocha：光斑中心 ΔRGB = 25**（(32,36,54) vs (18,18,29)）、全图 mean Δ 3.2 / max 30 / 24% 像素 Δ>3；**Latte：光斑中心 Δ = 19**、mean 3.4 / 36.7% Δ>3；**无光斑区 Δ = 0**（局部性正确；Latte 底部 wash 微暗 Δ5） |
| 亮度塌缩（探针） | `--dsh-glass-brightness-black: 1` ⇒ radial alpha `0.12 → 0`、wash 首 stop → `0 0 0`（完全塌缩）；移除后原值恢复 |
| 测试 | `glass-css.spec.ts` 25/25（新增 3 条；**变异验证**：删光斑即红、恢复即绿）；全量 **292/292**；双 typecheck 绿 |
| 产物 | 截图与探针在 `.debug/issue-25/`（`l2-{mocha,latte}[-off].png`、`probe-amb.js`、`verify-25.js`，均不入库） |

### 遗留（转正前处理）

- ~~README 预览图（`assets/previews/glass-latte.png` / `glass-mocha.png`）仍是改造前的地面，**转正前重拍**~~
  → **已重拍（2026-10-21）**：官方壳 0.2.1-rc.2、玻璃开（mica / blur 5 / frost 20 / brightness 50）、
  1440×900 @dpr2 ⇒ **2880×1800**（与四风味图同规格），`glass-combined.png` 由这两张重新斜切合成。
  构图：新会话发一条 demo 提示（Python 快排）取内容，**侧栏折叠**（避开工作区名与会话列表），
  滚到顶部。顺带把旧图里的两个毛病一起带走了：旧图顶栏是 ⑤ 宽度塌陷的样子（只有内容宽），
  且旧图侧栏展开了、露出真实工作区名。
  ⚠️ 本机 Playwright 不可用，链路改走 CDP（`scripts/screenshot-glass.cjs` 是 Playwright 版，本轮没用）；
  验收脚本在 `.debug/real-verify/`（`shot-preview.mjs` / `send-demo.mjs` / `prep-preview.mjs`，均不入库）。
- L3（漂移动画）与 saturate 交叉选项未做，维持「缓做 / 可选」。
