# issue #28 · 方案 B 实施规划：卡 + dock 合成一个圆角框（可选开关）

- 关联：`docs/issue-28-composer-dock-backdrop.md`（方案 A 已实施，`0.6.3` 转正、`0.6.4` 改磨砂幕布；
  上游 issue #28 已于 2026-10-19 关闭，**关闭 ≠ B 被批准或否决**）
- 状态：**仅方案，未动代码**（2026-10-17 定形）。口径 = 特性 → `0.7.0`（A 是修复 → `0.6.x`）。
- 维护者定形（2026-10-17）：*"和对话框边框连接起来，这部分和对话框是一个整体的圆角矩形框住，中间加个分割线；
  整体作为一个可选项在设置里可以开关。"*

## 1. 目标与验收

| # | 目标 | 验收方式 |
|---|---|---|
| 1 | 开：卡与 dock 共用一个 24px 圆角外框，中间一条发丝分割线 | 1:1 截图对比；框的左右边与今天的卡严格对齐（不左右位移） |
| 2 | 开：框内只有一个材质面（一次 blur），dock 不再需要 A 的地面色带 | 计算值：`inputbar` 的 `::before` 有 blur，卡的 `::before` 不存在，dock 的 `::before` 只剩 1px 线 |
| 3 | 关（默认）：与方案 A 完全一致，逐像素不变 | A/B 截图 Δ = 0 |
| 4 | 玻璃总开关关：回到上游原样 | 无 `[data-dsh-glass]`，规则一条不命中 |
| 5 | mica / compat 两种模式都成立 | 两模式各一张截图 |

## 2. 观感规格

```
┌───────────────────────────────┐  ← 外框：24px 圆角 / rim-strong 30% / 双层影 / 52% 填充 + blur
│  输入区（卡本体不再画任何东西）    │
├───────────────────────────────┤  ← 发丝线 1px：rim-soft 12%
│  3 轮 67 步 · 121 tok/s …      │  ← dock 行，行高不变（上游 26px 盒）
└───────────────────────────────┘
```

- 外框几何 = 今天的卡盒 + dock 盒，**不加宽**：左右仍然内缩 `--dsh-composer-side-clearance`（16px / 窄屏 8px）。
- 卡的 `border` / `border-radius` / `box-shadow` / `::before` 材质面全部让位给外框；卡自己只留 padding 与内容。
- 分割线画在 `dock::before` 的**上边**（1px，`--dsh-glass-rim-soft`），不给卡加 `border-bottom` —— 卡是 24px 圆角，
  底边线会穿角。
- dock 的下内边距由外框的 `inset` 负责（root 的 4px bottom padding 留在框外）。

## 3. CSS 草案（约 40 行，追加在 `glass.module.css` 里 A 之后）

开关用一个**属性**而不是 CSS 变量（布尔、与 `data-dsh-glass-float` / `-compat` 同族）：

```css
/* ---------- Fused composer (issue #28 B, opt-in): the dock joins the card
   inside ONE rounded frame with a hairline between them ---------- */
[data-dsh-glass][data-dsh-glass-fused] [data-dsh-glass-inputbar] {
  position: relative;
  isolation: isolate;            /* keeps the -1 plane inside the frame */
  border-radius: 24px;
  box-shadow: var(--dsh-glass-input-shadow);
}

[data-dsh-glass][data-dsh-glass-fused] [data-dsh-glass-inputbar]::before {
  content: '';
  position: absolute;
  /* frame == the card's current box: side clearance out, root's bottom pad out */
  inset: 0 var(--dsh-composer-side-clearance, 16px) 4px;
  z-index: -1;
  border-radius: inherit;
  background: var(--dsh-glass-card);
  border: 1px solid var(--dsh-glass-rim-strong);
  box-shadow: var(--dsh-glass-edge);
  backdrop-filter: blur(var(--dsh-glass-blur, 14px));
  pointer-events: none;
}

/* The card becomes bare content: no border, no shadow, no material plane.
   Its own plane must go (issue #19 kept the fill+blur on a plane; here the
   frame's plane owns both, and a second one would double-read the backdrop). */
[data-dsh-glass][data-dsh-glass-fused] [data-composer-card] {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: none;
}
[data-dsh-glass][data-dsh-glass-fused] [data-composer-card]::before { content: none; }

/* The A band is replaced by a hairline divider on the same pseudo. */
[data-dsh-glass][data-dsh-glass-fused] [data-dsh-glass-inputbar] > [class*='dock']::before,
[data-dsh-glass][data-dsh-glass-fused] [data-dsh-glass-inputbar] > [data-composer-dock]::before {
  left: 0;
  right: 0;
  bottom: auto;
  top: 0;
  height: 1px;
  background: var(--dsh-glass-rim-soft);
}
```

compat 模式：同一组规则再补一条 `[data-dsh-glass-compat][data-dsh-glass-fused] …::before{ background: var(--dsh-glass-card-raised); backdrop-filter: blur(12px) }`
（与现有 compat 卡配方对齐，别复用 mica 的 fill）。

## 4. 六个联动点（新增 durable 字段的老教训）

字段名：`glass.fusedDock`（布尔，默认 `false`）。**漏任何一处都是静默失败**，尤其是第 6 点。

| # | 文件 | 具体改动 |
|---|---|---|
| 1 | `src/state.ts` | `GlassState` 加 `fusedDock: boolean`（带注释说明「默认关 = 方案 A 观感」）；`DEFAULT_GLASS` 加 `fusedDock: false`；`sanitizeState` 加 `state.glass.fusedDock = glass.fusedDock === true`；`isDefaultState` 与 `settingsSectionsEqual` 各加一行比较 |
| 2 | `src/settings-catppuccin.ts` | 玻璃 schema 里加 `fusedDock: Schema.boolean().default(DEFAULT_GLASS.fusedDock)`（漏了会被 settings-seam 的「every default equals the shipped default」判红） |
| 3 | `src/client/glass/glass-layer.ts` | ① `Settings` 接口 + 构造默认值；② localStorage 键 `dsh.catppuccin.glass.fusedDock` + `readFusedDock/writeFusedDock`；③ `setFusedDock(value)` 方法（照 `setGlow` 抄：同值早退、写 settings、`applySettings()`、`publish()`、`writeFusedDock`）；④ `getSnapshot()` / `setRemoteState()` 各加字段；⑤ `applySettings()` 里 `document.documentElement.toggleAttribute('data-dsh-glass-fused', this.settings.fusedDock)`；⑥ `unmount()` 里移除该属性 |
| 4 | `src/client/glass/glass-layer.ts` 顶部 | 导出常量 `export const GLASS_FUSED_ATTRIBUTE = 'data-dsh-glass-fused'`（与 `GLASS_FLOAT_ATTRIBUTE` 并列，测试要用） |
| 5 | `src/client/glass/glass-row.tsx` + `src/client/index.ts` | `GlassRowInjected` 加 `setFusedDock`；`glassInjected()` 加一行；行内照 `glass.glow` 那段复制一个 `role="switch"` 开关（放在「地面光斑」之后、「恢复默认」之前） |
| 6 | `src/client/state-sync.ts` | 写操作列表加 `{ op: 'set', path: ['glass', 'fusedDock'], value: section.glass.fusedDock }` —— **漏这里不会红，只会「点了自己弹回」**（#26 实测过一次） |
| 7 | `src/client/locales.ts` | 7 份字典各加 `glass.fused` + `glass.fusedHint`（zh/en/ja/ko/es/fr/de） |
| 8 | （可选）`src/client/glass/glass-layer.ts` 注释块 | 记录「这是 opt-in 观感，不是修复」的一句话 |

文案建议：

- zh `glass.fused`：`输入区与状态栏合框`；`glass.fusedHint`：`把输入卡和下方的状态栏合成一个圆角框，中间加一条分割线；关闭时状态栏独立浮在下方（当前观感）`
- en：`Fused composer` / `Joins the input card and the status bar into one rounded frame with a divider; off keeps them as two stacked surfaces`

## 5. 测试清单

| 文件 | 加什么 | 变异验证 |
|---|---|---|
| `tests/glass-css.spec.ts` | 新块「fused composer (issue #28 B)」：① 外框平面挂在 `[data-dsh-glass-inputbar]::before` 且 `has blur`；② 卡在 fused 下 `border: 0` 且 `::before{content:none}`；③ dock 在 fused 下 `height: 1px` / `bottom: auto`；④ A 的地面色带在 fused 下被覆盖 | 删任一条 → 红 |
| `tests/settings-seam.spec.ts` | `GLASS_FIELDS` 数组加 `'fusedDock'`（第 121 行） | 不加 → 「defaults 对齐」红 |
| `tests/state.spec.ts` | sanitize（非布尔值回落 false）/ `isDefaultState` / `settingsSectionsEqual` | 同上 |
| `tests/glass-layer.spec.ts` | `setFusedDock` 写属性、`unmount` 移除属性、localStorage 往返 | 删 toggleAttribute → 红 |
| `tests/locales.spec.ts` | 7 份字典键齐平（若该测试是全键对比，自动覆盖） | — |
| `tests/rows.spec.tsx` | 开关渲染 + 点击回调（照 glow 那条） | — |

## 6. 风险与未决

| 风险 | 说明 / 对策 |
|---|---|
| 卡失去「浮起」观感 | 这是维护者要的形状，但与原观感差异大 ⇒ **必须默认关**。开框后卡的下缘不再有 24px 圆角与影，整块读作「一个输入面板」 |
| `:empty` dock | 0.2.1 的 active 相位空 dock 仍有 4px 高 ⇒ 框底会多一条贴着卡底的分割线。对策：`[data-dsh-glass-inputbar]:has(> [class*='dock'] > *)` 才画线；拿不到就接受（视觉上是一条收尾线） |
| 外框宽度与卡不齐 | 卡是 `width:100% + max-width` 居中；框取 `inset` 的内容盒。窗口极宽时卡比框窄 ⇒ 框比卡宽 0–N px。对策：真机量一次，必要时框也加 `max-width` 并居中 |
| backdrop root | 材质必须在 `::before` 上（#19）：`inputbar` 与卡都是 trigger palette 的祖先，元素本体不许加 blur。护栏已覆盖 `[data-dsh-glass-inputbar]`，但**座席不在 HOSTS 里**——顺手把座席加进去 |
| compat 配方错用 | compat 用 `--dsh-glass-card-raised` + `blur(12px)`，别复用 mica 的 `--dsh-glass-card` |
| 与 A 互相打架 | 同一 `dock::before`：fused 下必须显式覆盖 `bottom/top/height/background`，否则两条带子叠加 |
| hero / 轨迹视图 | hero 的 dock 常空 ⇒ 框=卡，正常；轨迹视图未实测，需一张截图 |
| 版本混发 | A 是修复、B 是特性，B 落 `0.7.0`；若同版本发，CHANGELOG 里要分开写 |

## 7. 验证步骤（落地时照跑）

1. `npx vitest run tests/glass-css.spec.ts tests/state.spec.ts tests/settings-seam.spec.ts tests/glass-layer.spec.ts --no-file-parallelism`
2. 变异：删 `toggleAttribute` / 删写操作 / 删 CSS 覆盖，各应红一次
3. `npx tsc -p tsconfig.json && npx tsc -p tsconfig.vitest.json && npx tsdown`
4. 真机 CDP（照 `.debug/issue-28/probe.mjs`）：开/关各拍一张，量
   - 框的左右边 x 与原卡 x 差 ≤ 1px
   - 框内 `::before` 只有一层 blur（数 `backdrop-filter` 命中节点）
   - 关态与 0.6.x 的 A 截图 Δ = 0
   - 开态 dock 区域纹理能量（文字穿透） = 0
5. mica / compat × 四风味 × 亮度 0/50/100 各一张，只在 `0.7.0` 发版前跑一轮

## 8. 工作量

| 段 | 估时 |
|---|---|
| 第 1–6 点（state / schema / layer / sync / row / locales） | 60–90 分钟（机械但六处必须齐） |
| CSS + 两模式配方 | 30 分钟 |
| 测试 + 变异 | 45 分钟 |
| 真机截图 + 调几何 | 40 分钟 |
| CHANGELOG + README 设置项说明 | 15 分钟 |

合计约 **3–4 小时**，可分两次：先落 1–6（可开关但观感未调），再落 CSS + 验证。

## 9. 明确不做

- 不改上游 DOM（不加 wrapper、不加接缝属性）。
- 不为 fused 单独加 blur 预算（外框那层就是卡原来那层，位置没变）。
- 不把 A 的地面色带去给 fused 用 —— 框已经挡住 dock，两条带子会叠。
