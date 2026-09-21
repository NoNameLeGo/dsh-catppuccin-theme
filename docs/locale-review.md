# 语言字典复核清单（item YY）

> 状态：**待母语者复核**（P3、非阻塞）。本文件不是「翻译」，而是让下一个愿意帮忙的母语者
> **20 分钟上手**的靶子，免得每次都要重新审计一遍。
> 审计日期 **2026-09-21**；口径与工具见文末「附录」。

---

## 1. 现状（可复核）

| 项 | 值 |
|---|---|
| 字典 | **7 个**：`zh`（键集真源）、`en`、`ja`、`ko`、`es`、`fr`、`de` —— `src/client/locales.ts` |
| 键数 | **78**，7 个字典**完全一致**（missing=0 / extra=0） |
| 测试锁什么 | `tests/locales.spec.ts`：键集一致、值非空、`{profile}` / `{s}` 占位符齐全、（2026-09-21 新增）旋钮与预设同词根、`glass.help` 必须列出三个预设名 |
| 注册方式 | `ctx.locale.register(NS, { zh, en })` + 5 个 `addLanguage({ label, fallback: 'en' })`（`src/client/index.ts:319-325`） |
| 谁决定用哪个语言 | **宿主 locale**（设置 → 语言下拉），插件不自带语言开关；缺键时逐键回退到 `en` |

**结论**：结构层面已经无懈可击；**测试无法校验的只有「译得对不对」**——这正是 YY 不能自动化的原因。

## 2. 来源与复核状态

| 语言 | 来源 | 复核状态 |
|---|---|---|
| `zh` | 首版 `f8e8a8e` | ✅ 作者母语 |
| `en` | 首版 `f8e8a8e` | ⚠️ 未经英语母语者复核（回退语言，抽查未发现问题） |
| `ja` `ko` `es` `fr` `de` | **同一个 commit `bfa2f91` 一次性加入**；此后每批新文案（J 批 help / DD 副标题 / U 错误分类 / TT 的 `row.overridesHint` 改写 / Z 的 aria 文案）都批量补 | ❌ **从未有人类复核** |

## 3. 复核清单（按优先级）

### 3.1 长文案：**只有 9 条**，读完就够（其余 51 条是短标签、18 条中等）

| key | 说明 |
|---|---|
| `row.description` | 行描述 |
| `row.help` * | tooltip |
| `row.overridesHint` | 覆盖编辑器提示（fr 比 en 长 16%、es 与 en 持平） |
| `glass.help` * | tooltip（ja/ko 最短 47~51%，fr 最长 114%） |
| `glass.modeHint` | 模式说明（fr 111% / de 114% / es 107%） |
| `update.description` | 行描述 |
| `update.help` * | tooltip（**fr 121%**，最夸张的一条） |
| `update.commandHintDesktop` | 升级命令提示（含 `{profile}`） |
| `update.localInstall` | 本地 link / 源码安装的提示 |

（`*` = 只出现在原生 `title` tooltip 里，不占布局）

### 3.2 已修（2026-09-21，无需再管，但可复核判断对不对）

**同语言内「frost / 磨砂」被拆成两个词**：`glass.frost`（磨砂**度**旋钮）与 `glass.presetFrosted`（磨砂**预设**）用词不一致——

| 语言 | 修前 | 修后 |
|---|---|---|
| ja | 旋钮 `曇り` / 预设 `フォグ`（fog） | 两者都是 **`曇り`** |
| ko | 旋钮 `프로스트` / 预设 `포그`（fog） | 两者都是 **`프로스트`** |

同时同步了 ja/ko 的 `glass.help` 里的预设列表（否则 help 会指着一个不存在的预设名），并补了两条断言把「同词根」与「help 必须列出三个预设名」锁住。es/fr/de 本来就一致（Escarcha/Escarchado、Givre/Givré、Frost/Frostig），未动。

**遗留待母语者判断（没有证据前不动）**：ja 的长文案里「磨砂玻璃」用的是 **`すりガラス`**（`glass.description`），而旋钮/预设用 `曇り`。两者都自然，但**是否该统一到 `すりガラス`** 属母语者的自然度判断，不是错误——请在复核时明确一句，改的话是 2 个键。

### 3.3 长度膨胀（es / fr / de）——已确认**不会截断**，只是行高变高

以 en 为 100%，各语言最长几条的长度比：

| 语言 | 最长几条相对 en | 备注 |
|---|---|---|
| ja | 47% ~ 69% | 最短 |
| ko | 51% ~ 69% | |
| es | 100% ~ 113% | `glass.help` 409/365 |
| fr | 111% ~ **121%** | `update.help` 203/168、`row.overridesHint` 186/161 |
| de | 103% ~ 114% | `glass.modeHint` 188/165 |

**为什么不用改**：`.rowHint` / `.knobHint`（`GlassRow.module.css:50-57`，12px/18px）与 `CatppuccinRow` 的 hint（`lineHeight:'18px'`）都**没有** `line-clamp` / `text-overflow`；文件里唯一的 `overflow: hidden` 在 `.segmented` 按钮框上，与文案无关 ⇒ 长文案**换行**，代价是设置弹窗行变高。母语者若顺手，可考虑把 fr 上面 2 条压短。

### 3.4 机器查不了、只能靠母语者的

- **语气/敬体一致性**：ja 混用「〜します」与「〜を。」式省略句（`glass.help` 结尾就是省略式）。
- **社区惯用译法**：三档预设的命名（Clear / Standard / Frosted ↔ 清透/标准/磨砂）、Mica / 云母。
- **语序与量词**：`{s} 秒` / `{s}초` / `{s}s`；`{profile}` 在句中的位置（ja/ko 用 `profile「…」` 前置，de 用 `Profile „…“` 前置，fr 后置 `« {profile} »`）。
- **标点**：zh 已统一为 `「」`（原 `row.overridesEmpty`、`update.help` 用 `“”`，2026-09-21 改）；en 保留直引号（与 DSH 宿主风格一致），未动。

## 4. 复核方法与成本

- **成本**：78 键里 51 条是短标签 ⇒ 认真读 **9 条长文案 + 顺手扫中等的 18 条**，**20~30 分钟 / 语言**。
- **怎么看**：直接读 `src/client/locales.ts` 里对应语言的块（每个 key 与 `zh` 同序、同 key）。
- **改完怎么验**：`pnpm test`（`tests/locales.spec.ts` 会挡住键集漂移、上面两条术语/文案一致性问题）；改的是用户可见文案时，顺手在 `CHANGELOG.md` 的 `## [Unreleased]` 记一条。

## 5. 触发条件（什么时候才做）

**有对应语言的用户反馈**（issue / 评论 / 邮件）——届时按 §3.1 的 9 条优先复核该语言，并把结论回填到本节。
**不做的事**：让 AI 自己猜「更好」的译法。同一条准绳：拿不出「现在这版在真实使用下不成立」的证据，就不动（与「不改官方配色」是同一个标准：质量偏好 ≠ 缺陷）。

---

## 附录：审计口径（2026-09-21）

- 解析 `src/client/locales.ts` 的 7 个字典块，逐 key 比对：键集、空值、占位符 `{profile}` / `{s}`。
- **漏翻筛查**：列出「与 en 逐字相同」的值 —— 命中项全部是**合法同源词**（`Mica`、`Mode`、`Standard`、`Stable`、`Beta`、`Frost`），**没有漏翻**。
- **术语分裂筛查**：同一概念在不同 key 上的用词（frost 旋钮 vs 预设 → ja/ko 各一处，已修）。
- **长度膨胀筛查**：各语言值与 en 的字符数比。
- 脚本在 `D:\Vibe-Coding\.cache\glass-blur-probes\locale-{audit,terms,quotes,keys,shape}.cjs`（**未入库**，本机探针目录）。
