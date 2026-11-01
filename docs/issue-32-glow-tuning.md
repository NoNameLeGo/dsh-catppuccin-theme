# issue #32：地面光斑能不能调强度 / 位置 / 范围

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/32>（报告人 `aurasuisui`，2026-11-01）
- 状态：**强度已实施（本批）**；**位置不做**；**范围（大小）登记为 P1**。
- 报告环境未写版本；诉求三条：「强度调高一点」「位置可调」「范围可调」，理由是「一直开着但画面有点单调」。
- 关联：**#25**（氛围地面 = wash + 两枚光斑，`docs/issue-25-ambient-ground.md`）、**#26**（光斑转默认关 + `光斑` 开关，见 CHANGELOG `0.6.3`）。

---

## 1. 现状：为什么以前只有「一个开关」

光斑从来不是「固定效果」，而是一个 0/1 门后面跟着两枚写死几何的 radial：

| 层 | 位置（符号，不是行号） | 事实 |
|---|---|---|
| CSS | `glass.module.css` → `[data-dsh-glass] body, [data-dsh-glass] [data-dsh-glass-ground-sample]` | 两枚 `radial-gradient`，alpha = `calc(12% / 10% × --dsh-glass-ambience × --dsh-glass-glow)`；几何 `58% 46% at 18% 6%`、`48% 42% at 86% 14%` |
| JS | `glass-layer.ts` → `GLASS_KNOB_PROPERTIES` / `applySettings()` | 只写 `--dsh-glass-glow` = `'1' \| '0'` |
| 状态 | `state.ts` → `GlassState.glow`，`DEFAULT_GLASS.glow = false` | 出厂关 |
| UI | `glass-row.tsx` → `Switch` + `glass.glowHint` | 一个开关，无滑块 |

**#26 是那个开关存在的原因**（也是本 issue 不能照抄「加几个拖拽」的原因）：光斑锚屏幕坐标，面板各自坐落在别处 ⇒ 每块玻璃透出光斑的不同切片。实测：光斑开时一张侧栏卡自上而下 ΔRGB (12,15,21)，只留 wash 时全窗 ≤(4,4,5)（报告人的「三块玻璃读出三种底色」）。`--dsh-glass-ambience` 则保证亮度旋钮拉到两端时整片氛围归零，复刻 0.2.5 的纯白 / 纯黑承诺。

---

## 2. 三条诉求的裁定

| 诉求 | 裁定 | 理由 |
|---|---|---|
| 强度 | **做** | 标量，只放大既有两枚光斑：不新增合成层、不改色相、不碰 wash；`glass-css.spec.ts` 的既有断言（光斑挂 token / wash 不读光斑开关）全部保留 |
| 范围（大小） | **缓（P1）** | 半径倍率改变「局部性」，直接动 #26 的 per-pane Δ，需四风味 × 两档重新取数；且与「强度」在观感上高度重叠（都是「更明显」） |
| 位置（任意坐标） | **不做** | ① 上游没有二维坐标控件，自绘拖动器 = 新组件 + 键盘可达 + 移动端；② 它把 #26 的代价（面板各读一段）交到用户手里放大，出了问题我们无法给判据；③ QA 矩阵 4 风味 × 任意位置 × mica/compat 不可穷尽。若将来非做不可，只允许**预设方位枚举**（如四角 / 居中），且 `at 18% 6%` 这类字面量必须改由 JS 写变量 |

---

## 3. 实施方案：强度旋钮（0–200%，100 = 现状）

### 3.1 值模型：新增 `glowStrength`，**不**把开关并进数值

```ts
glass: { …; glow: boolean; glowStrength: number /* 0..200, default 100 */ }
```

不采用「0–100 且 0 = 关」的合并式：设置缝的语义是「解析成出厂默认」=「用户还没选过」（`src/state.ts` 的 `isDefaultState` / `settings-catppuccin.ts` 的注释都写着这条）。合并后，任何 0.6.x 写下的 `glow: true` 文档都缺 `glowStrength` 字段 ⇒ 解析成 0 ⇒ **静默把用户已开的光斑关掉**。加法式零迁移：缺字段 = 100 = 该用户原本的观感。

### 3.2 CSS：倍数**内联**在 `background` 里

```css
calc(12% * var(--dsh-glass-ambience) * var(--dsh-glass-glow, 0) * var(--dsh-glass-glow-strength, 1))
```

- 内联是硬约束（#25 的失效传播陷阱：经过中间 custom property 的加权在亮度变量变化时不重算）。
- **不复用** `--dsh-glass-glow` 承载倍数：它是 #26 锁定的 0/1 开关，语义混用会连带毁掉「默认关」那条护栏。
- wash 三层 stop **不读**新变量（wash 是 #26 保留的默认观感，不能被光斑设置连坐）。

### 3.3 链路清单（缺一处 = 「改了但重启丢」）

| 文件 | 改动 |
|---|---|
| `src/state.ts` | `GlassState.glowStrength`、`GLOW_STRENGTH_MAX` / `GLOW_STRENGTH_DEFAULT`、`DEFAULT_GLASS`、`sanitizeState` 钳制、`isDefaultState`、`settingsSectionsEqual`、`carryGlass('glowStrength')` |
| `src/settings-catppuccin.ts` | 字段表 `glowStrength: number().min(0).max(GLOW_STRENGTH_MAX).default(100)`（上下限必须与 sanitizer 同一对常量，否则每次 publish 都会重写文档）；`CatppuccinConfig.glass.glowStrength` |
| `src/client/state-sync.ts` | `stateToMutateOps` 加 `glass.glowStrength`（漏了 = 文档保留 schema 默认，滑块被下一次 adoption 拖回 100） |
| `src/client/glass/glass-layer.ts` | `GLASS_KNOB_PROPERTIES`、`GlassSettings`、`SETTINGS_DEFAULTS`、`NUMERIC_KEYS`（键 `dsh.catppuccin.glass.glow-strength`，自动进 `NUMERIC_STORAGE_KEYS`，跨窗口才生效）、`clampSetting` 的 200 分支、`setGlowStrength`、`getRemoteState` / `applyRemote` / `reloadSettings` / `resetDefaults`、`applySettings` 写 `String(glowStrength / 100)` |
| `src/client/index.ts` | `glassInjected()` 加 `setGlowStrength` 转发 |
| `src/client/glass/glass-row.tsx` | 注入 `setGlowStrength`；`glow &&` 条件下渲染 `Knob`（0–200，step 5，单位 `%`）——关着时不留死控件 |
| `src/client/locales.ts` | 7 语言加 `glass.glowStrength`；`glass.glowHint` 补一句「强度可调，100% 即上述观感；亮度拉满时氛围归零，光斑一并淡出」 |
| `src/client/glass/glass-css.gen.ts` | `node scripts/gen-glass-css.mjs` 重新生成（minify 后 `calc` 嵌套完好） |
| `README.md` / `README.en.md` | 玻璃段「地面光斑」一条补强度说明 |
| 测试 | 见 §4 |

---

## 4. 边界情况（都已按最保守的一侧实现）

1. **亮度极端时「强度没反应」**：`ambience = 1 − white − black`，亮度拉满 ⇒ 氛围归零 ⇒ 光斑一并淡出。这是 0.2.5 的承诺，不为新旋钮让步；文案里明说。
2. **上限被静默夹回**：`clampSetting` 原本是 `key === 'blur' ? 40 : 100`，200 的上限必须有显式分支，否则滑块过 100 就弹回。已加，并有断言（变异验证见 §5）。
3. **跨窗口同步 F1 陷阱**：新键必须走 `NUMERIC_KEYS` / `NUMERIC_STORAGE_KEYS`，不能写 `'glowStrength' in NUMERIC_KEYS`（判的是属性名，永远 false）。
4. **#25 失效传播**：倍数只出现在 `background` 的 `calc` 里；`glass-css.gen.ts` 生成后核对过 minify 结果仍是 `calc(12% * … * var(--dsh-glass-glow,0) * var(--dsh-glass-glow-strength,1))`。
5. **老文档兼容**：`glow: true` + 缺 `glowStrength` ⇒ 100（`clampFinite` 的 fallback 与 schema default 都是它）。
6. **两处比较函数 + 回放**：`isDefaultState` / `settingsSectionsEqual` / `carryGlass` 三处已同步，`tests/state.spec.ts` 的「drift guard」表也加了这一项（它按 `Object.keys(baseline.glass)` 反推期望，漏加即红）。
7. **glow 关闭时不渲染强度旋钮**：与「总开关关掉就隐藏整个旋钮组」同一套逻辑，避免滑块指向不存在的效果。
8. **上限的定性**：`GLOW_STRENGTH_MAX = 200` 目前是**保守预算**（品牌光斑峰值 alpha 12% → 24%），不是实测标定值——见 §6。

---

## 5. 已验证

| 项 | 结果 |
|---|---|
| 全量测试 | **398/398 通过**（22 文件，`--no-file-parallelism`；合并 issue #31 之后） |
| 双 typecheck | `tsc -p tsconfig.json` / `tsconfig.vitest.json` 均干净 |
| `pnpm build` | tsdown 产物正常；`glass-css.gen.ts` 重新生成，minify 后表达式完好 |
| 新增护栏 | `glass-css.spec.ts`「两枚光斑都带强度、wash 不带」；`glass-layer.spec.ts`「默认 100 / 跨窗口 1.8 / 越界钳到 200 / setter 钳制」；`rows.spec.tsx`「关闭时无滑块、开启时 100% 且写穿 160」 |
| 变异验证 | ① 删掉 CSS 里的 `* var(--dsh-glass-glow-strength, 1)` ⇒ `glass-css` 新用例**红**；② 把 `clampSetting` 的 200 分支改回 `: 100` ⇒ `glass-layer` 新用例**红**。均已恢复 |

---

## 6. 未验证（留给真机 / 下一批）

1. **Latte 对比度标定**：需要在真机用 CDP 采样「光斑最亮处」的 `label-primary` vs 底色对比度（强度 0 / 100 / 200 三档 × 四风味），据此要么确认 200、要么下调 `GLOW_STRENGTH_MAX`。**在此之前 200 只是一个不会被用户轻易打到失效的值。**
2. **观感轮**：200% 是否「明显但不过分」，需要截图与维护者拍板；本批不改任何默认值，所以**预览图无需重拍**。
3. **#26 回归读数**：强度拉满时单面板上下 ΔRGB 会比 (12,15,21) 更大——这是用户显式选择的结果，但应该取一次数字写进文档，供以后判「是不是又变成默认」使用。
4. **范围（大小）旋钮**：P1。若做，形态建议是单一半径倍率（如 0.6–1.6），不是二维坐标；且必须先取 §6.3 的读数。

---

## 7. 不做什么（防误伤）

- 不给带 blur 的面加回 blur（#13 / #25 的结论不变：低频场对 blur 近似恒等）。
- 不动 wash 的三层 stop、不动 `--dsh-glass-card*` 填充配方（本 issue 是「光斑可调」，不是「氛围重做」）。
- 不新增第三枚光斑、不引入动画（#25 §1.2：动画收益是「背景在动」，与玻璃功能无关）。
- 不把 `glow` 与 `glowStrength` 合并（§3.1 的老文档陷阱）。
