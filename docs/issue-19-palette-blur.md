# issue #19 分析与修复方案：斜杠指令面板（`[data-trigger-menu]`）没有毛玻璃

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/19>
- 状态：**已定位根因，方案 A 已实施（2026-10-01，见 §10）**；真机 e2e 断言已写进脚本但**本轮未跑**
  （本机 Node 不能 spawn 子进程 ⇒ Playwright 的 `launch()` 不可用），离线整页 A/B 已给出实测数字。
- 报告内容：标题「调用指令后弹出菜单无模糊，可读性不佳」＋截图一张 ＋ 一句「补上这个元素就行」。
- 报告环境（本机 `~/.dsh/profiles/desktop/cordis.patch.yml` 实测）：玻璃**开**、`mode: mica`、`blur: 2`、`frost: 20`、`brightness: 50`、`flavor: catppuccin-mocha`。
- 复现环境：本机上游包两线都核过——`0.1.7-rc.2` 与 `0.2.0-rc.2`（`%APPDATA%\DSH\data\versions\<ver>\node_modules\@deepseek-ai\`），另加 npm tgz 取证的 `0.1.7-alpha.2`。
- 探针：`.debug/issue-19/*.html` + headless Chromium 截图 + 像素统计（**不入库**，`.gitignore:36`）。

## 1. 现象与复现

在输入框敲 `/`（或任意触发器）→ 弹出的候选面板**压在一段长转录上**，面板底下的聊天文字**原样透出**（`反馈 feedback`、`压缩 compact`、`模型 model`、`下载日志 export` 那几行），面板自己没有毛玻璃。面板内容本身清晰，是**背板**看不清 ⇒ 报告人说的「可读性不佳」。

面板行是同一块表面的若干行，不是多个弹层；截图里混进来的 `已编辑 2 个文件` / `tools/mcp-call.mjs` / `./dsh/profiles/desktop/cordis.patch.yml` 都是**面板背后**转录里的工具卡片，不是面板内容。

## 2. 这个面板是谁、挂在哪

| 事实 | 证据（`0.2.0-rc.2` / `0.1.7-rc.2`） |
|---|---|
| 面板根节点是 `div[data-trigger-menu]`（候选菜单 `MenuView`） | `dsh-client-ui-input-trigger/lib/client.js`（两版都有 `"data-trigger-menu": ""`） |
| 挂载点是 composer 的 **`conversation.input.overlay`** 插槽 | 同包注释：「renders the InputTriggerService menu store into the **conversation.input.overlay** anchor」 |
| 该插槽的宿主是 **`[data-composer-card]` 的第一个子节点** `.overlayAnchor` | `dsh-client-ui-conversation/lib/client.js`：`div.card[data-composer-card]` → `div.overlayAnchor` → `renderSlot("conversation.input.overlay")`（`0.1.7-alpha.2` tgz 同构） |
| `.overlayAnchor` 是 `height:0; position:absolute; inset:0 0 auto`，面板是 `position:absolute; bottom:calc(100% + 4px); left:0; right:0` | `InputBar.module.css` / `MenuView.module.css`（两版同一形态） |

⇒ **面板整个悬在 composer 卡片盒子之外**（`bottom: 100% + 4px`），只盖在转录上。

面板的材质在两线来自不同位置（两处都在 `[data-composer-card]` 内部）：

| 上游线 | 填充 | 模糊 |
|---|---|---|
| `0.1.7-alpha.1/2`、`0.1.7-rc.*` | 面板元素自身 `background: var(--dsw-specific-menu)`（`#f8f9fa94` = 58% / `#43454a73` = 45%） | 面板元素自身 `backdrop-filter: var(--dsw-menu-backdrop-filter)` |
| `0.2.0-rc.*` | `MenuSurface` 的 `.material` 面：`background: var(--dsw-menu-surface-fill)`（同 58% / 45%） | 同面 `backdrop-filter: var(--dsw-menu-backdrop-filter)` |

`--dsw-menu-backdrop-filter: blur(40px) saturate(150%)` 在两条线都由 `dsh-client-ui-theme` 声明（`gradient-shadow-text.css`：`--dsw-mask-blur:none; --dsw-menu-backdrop-filter:blur(40px) saturate(150%)`）。

**上游的设计意图写在自己注释里**（`dsh-client-ui-primitives/lib/MenuSurface.module.css:19-20`）：

> Filtering only the background keeps nested menus and fixed overlays free of an ancestor backdrop root or a new fixed-position containing block.

即上游特意把「材质面」拆成 `z-index:-1` 的子层，就是为了**别让容器变成 backdrop root**。本 issue 正好撞在反面。

## 3. 根因

**本皮肤给 composer 卡（mica 非分栏态）或输入栏（分栏态 `:has([data-dsh-glass-stats])`）加了 `backdrop-filter`，于是那个祖先成为面板的 backdrop root；而面板整块区域在祖先的分组里什么都没画（祖先的填充只覆盖自己的盒子），面板的 `blur(40px)` 变成读空 ⇒ 等价于 `backdrop-filter: none`，只剩 58%/45% 的透明填充，转录原样透出。**

附带的第二层问题：本皮肤的「浮层家族」没收录 `[data-trigger-menu]`（`src/client/glass/glass.module.css` 里 `grep trigger-menu` = **0 命中**），所以兼容模式下连自家填充/描边都没有，纯上游 58% 档。

## 4. 实测数字（headless Chromium，同构 DOM）

`stdev` = 采样带亮度标准差（条纹/笔画越清晰越大，`≈0` 表示被糊平）。

| 探针 | 结构 | 面板区 | 面板下方 | 结论 |
|---|---|---|---|---|
| `ancestor-probe2.html` col1 | 祖先 `blur(3px)` + 面板面 `blur(40px)` | **100.41** | **100.41** | 面板自带模糊**恒等**（两组数字逐位相同） |
| `ancestor-probe2.html` col3 | 祖先无 filter + 面板面 `blur(40px)` | **7.04** | 118.79 | 面板模糊**真的在画** |
| `optionD.html` col1 | 卡不 filter（模糊在 `::before` 面）+ 面板面 `blur(40px)` | **3.16** | 47.65 | 方案 A 的形态：面板模糊恢复 |
| `real-values.html` | 报告人取值（mocha、输入栏 20.8% + `blur(2px)`、面板 45% + `blur(40px) saturate(150%)`） | 有模糊 16.79 / 去掉模糊 20.94，逐像素 `mean|Δ|=3.20`、`max=11` | — | 笔画**存活**（`blur(40px)` 若成立应糊平）；这点差异来自 `saturate(150%)` 与合成抗锯齿 |

亮度账（latte，`--dsw-alias-bg-base` `#eff1f5`、`label-primary` `#4c4f69`、`layer-3` 同 ground，填充 58%）：

| 填充 α | 透过文字与背景的幽灵对比度 | 观感 |
|---|---|---|
| 58%（上游现状） | **1.97 : 1** | 明显可见（=截图） |
| 70%（模型菜单先例） | 1.58 : 1 | 仍可见 |
| 85% | 1.25 : 1 | 勉强 |
| 92% | **1.12 : 1** | 基本不可见 |

报告人 `frost: 20`（= 0.4×）把 composer 的填充压到 20.8%，幽灵亮度差还剩 **约 43.5%**，所以他的截图比默认更糟。

## 5. 修复方案（三选一）

### 方案 A —— 把 composer 的模糊从「容器」搬到「材质面」（推荐）

照抄上游 `MenuSurface` 的做法：外壳只留布局/描边/投影并加 `isolation: isolate`，模糊挂在 `::before` 材质面上。这样 composer 卡（及分栏态的输入栏）**不再是 backdrop root**，面板自带的 `blur(40px)` 立刻恢复；0.1.7 全线与两种玻璃模式一并生效，且**不发明任何颜色**（不动 alpha、不动 token 语义，符合硬规则 4）。

代价与风险：① 模糊住的合成层从「容器」换成「伪元素」，容器内文字会移出被过滤的分组（本皮肤记录过这类移动带来的字形重抗锯齿 ≤64/255）⇒ 必须做 composer 自身的像素 A/B；② 分栏态要给 `[data-dsh-glass-inputbar]` 补 `position: relative; isolation: isolate`，需真机确认栏内没有「靠外层定位的绝对定位子元素」被改参照。`::before` 在上游是**空着的**（`.uV2eYG_card` 只被 `cardWorkspaceTrigger` 占用了 `::after`）。

### 方案 B —— 面板打开期间让出祖先的模糊（最小改动）

```css
[data-dsh-glass-float]  [data-composer-card]:has([data-trigger-menu]),
[data-dsh-glass-float]  [data-dsh-glass-inputbar]:has([data-trigger-menu]),
[data-dsh-glass-compat] [data-composer-card]:has([data-trigger-menu]) {
  backdrop-filter: none;
}
```

1 条规则、可逆、无布局风险。代价：面板打开期间 composer **自己**没有模糊 —— `blur: 2`（报告人）不可见，`blur ≥ 10` 时开/关面板会有一次可见的「糊→平」跳变；另外属性门控的 `backdrop-filter` 在本项目有历史包袱（issue #16 的残带），这里门控是「面板在 DOM 里」，关闭即移除节点，相对干净但仍需真机复核。

### 方案 C —— 只加填充（兜底，不给模糊）

给面板一枚更实的填充，**必须本地化到面板选择器**：不能改 `--dsw-menu-surface-fill` / `--dsw-specific-menu` 的值（那两个 token 还画队列坞、todo 面板、目标栏、任务列表、统计弹窗，见 `src/client/index.ts:296-305`）。一条件覆盖两条上游线（0.1.7 线面板自己是表面、0.2.0 线表面透明也就落在同一元素上）：

```css
[data-dsh-glass-float] [data-trigger-menu] {
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-3) 92%, transparent);
}
```

按 §4 的账，92% 才把幽灵压到 1.12:1。代价：面板变「近实心」，丢掉玻璃感，与报告人「想要模糊」的诉求相反；且 `[data-overflow-below]::after` 那条底部渐隐还用 `--dsw-specific-menu`，会与新的实填充轻微错色。

### 未采纳：直接给 `[data-trigger-menu]` 加 `backdrop-filter`

读者第一个会想到的写法，实测无效：祖先已是 backdrop root，后代再加模糊仍是读空（§4 第一行），白付一次每帧 backdrop 回读（违反 issue #13 的模糊预算，`tests/glass-css.spec.ts` 的护栏就是为此立的）。**只有先做 A 或 B，这条才有意义。**

### 对比

| | 观感 | 改动面 | 风险 | 上线顺序建议 |
|---|---|---|---|---|
| **A** | 真毛玻璃（恢复上游 40px） | composer 两态 + compat 同款，约 20 行 | 中（需像素 A/B + 分栏定位复核） | 一次做对 |
| B | 真毛玻璃，但 composer 自身模糊在面板打开时消失 | 1 条规则 | 低（`blur ≤ 4` 时无感） | 先止血，A 落地后撤掉 |
| C | 近实心、无模糊 | 1 条规则 | 低 | 仅当 A/B 都被否决 |

推荐：**A 为主**（报告人截图里的模式就是 mica，`blur: 2` 下 A 的收益最大、B 的代价近乎为零，可以先 B 后 A，但两条规则不要同时留）。

## 6. 需要改的文件与位置（计划；实际落地清单见 §10）

| 文件 | 位置 | 改什么 |
|---|---|---|
| `src/client/glass/glass.module.css` | `465-528`（`[data-dsh-glass-float] [data-composer-card]` 配方） | 容器去掉 `backdrop-filter`、`background` 交给材质面、加 `isolation: isolate`；新增 `[data-composer-card]::before` 材质面（`inset:0`、`border-radius:inherit`、fill + blur + 内侧高光） |
| 同上 | `545-586`（分栏态 `[data-dsh-glass-inputbar]:has([data-dsh-glass-stats])`） | 同上搬到 `[data-dsh-glass-inputbar]::before`，容器加 `position: relative; isolation: isolate`（**只加 isolation 不够，伪元素需要定位上下文**） |
| 同上 | `933-950`（compat composer 独立规则 + `::before` 材质面） | 同 A 的形态（compat 的 `blur` 家族与填充家族各让 composer 卡退出，`outline` rim 保留在卡本体） |
| 同上 | `171-181`（浮层 14px 圆角族，含 `[role='menu']`） | 可选：加入 `[data-trigger-menu]`（它自身是 16px，家族统一才一致） |
| 同上 | `841-856`（compat 填充/描边族） | 只有走方案 C 才需要收 `[data-trigger-menu]` |
| `src/client/glass/glass-css.gen.ts` | — | 生成物：`pnpm build`（`scripts/gen-glass-css.mjs`）后一并提交 |
| `tests/glass-css.spec.ts` | `47` 的 `VISIBLE` 名单、`112-121` 的 erasers 用例 | 见 §7；**方案 A 必须新增一条「托管浮层的容器不得自带 backdrop-filter」** |
| `AGENTS.md` | 硬规则 4 的推论段（`blur` 预算那段） | 补一条：「不要把 blur 加在**托管浮层的容器**上（如 composer 卡的 overlay 锚点宿主）——那会让浮层自己的 backdrop-filter 变成读空，issue #19」 |
| `CHANGELOG.md` | `[Unreleased]` → 修复 | 一条（`0.5.9-beta.0` 已发，下一枚建议 `0.5.10-beta.0`） |
| `docs/issue-19-palette-blur.md` | 本文 | — |

## 7. 验证方式

1. **样式护栏（vitest，秒级）** `tests/glass-css.spec.ts` 新增：
   - 「托管浮层的容器不得自带 backdrop-filter（issue #19）」：遍历所有 `backdrop-filter ≠ none` 的规则，断言**没有** selector 命中 `[data-composer-card]` / `[data-dsh-glass-inputbar]` 本体（只允许 `::before` 面）；
   - 「材质面存在且带 blur」：`[data-composer-card]::before` 与 `[data-dsh-glass-inputbar]::before` 各有一条带 `backdrop-filter` 的规则；
   - 把 `VISIBLE`（`47`）里的 `[data-composer-card]` 换成 `[data-composer-card]::before`；`erasers` 用例（`112`）随重构调整。
2. **真机回归断言（本 issue 的核心护栏）**：起宿主 → 打开会话 → 输入 `/` → 在页面里断言 **`[data-trigger-menu]` 的每一个祖先节点 computed `backdrop-filter` 均为 `none`**。这条断言在修前必红、修后必绿。
3. **模糊真在画（不是恒等读取）**：面板区域两轮比对——原样 vs 注入 `[data-trigger-menu] *{backdrop-filter:none}`。两轮像素必须**显著不同**；若差异 ≈ 0，说明模糊还是读空（本次的失效模式），断言即失败。
4. **composer 自身像素 A/B（方案 A 必做）**：按 issue #13 的手法——隐藏表面自身内容后 A/B，方案 A 前后应**逐像素一致**；再对正常内容统计差异分布，确认没有位移/色偏（只允许字形重抗锯齿）。
5. **变异验证（本项目铁律）**：临时删掉 `::before` 的 `backdrop-filter` 跑第 2、3 条，必须**变红**。同文件里的假时钟用例要推得比先前所有写入更远，避免 TTL 缓存假绿。
6. **报告人配置目视**：`mode: mica / blur: 2 / frost: 20 / flavor: catppuccin-mocha`（= 他现在的 `desktop` profile 配置），长转录上敲 `/` → 面板背后应是**一片糊**而不是字。
7. **兼容模式同样过一遍**（`mode: compat`）：compat 家族没有收 `[data-trigger-menu]`，第 2 条断言在 compat 下同样要绿（修前必红）。

## 8. 复现 / 重测步骤

```bash
# 结构探针（不需要宿主，直接开浏览器看）
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --headless=new --disable-gpu --no-proxy-server \
  --user-data-dir=D:\Vibe-Coding\dsh-catppuccin\.debug\issue-19\cud \
  --window-size=1080,470 \
  --screenshot=D:\Vibe-Coding\dsh-catppuccin\.debug\issue-19\matrix.png \
  file:///D:/Vibe-Coding/dsh-catppuccin/.debug/issue-19/matrix.html

# 像素统计（隔离 venv，Pillow 已装）
C:/Users/LeGo/.workbuddy/binaries/python/envs/default/Scripts/python.exe <统计脚本>
```

真机一轮按 `AGENTS.md` 的 e2e 跑法（`DSH_BIN=<版本>/node_modules/@deepseek-ai/dsh/lib/bin.js` + 系统 Chrome + `--no-proxy-server`）；注意本机 **Node 不能 spawn 子进程**，`browser.launch()` 不可用，浏览器侧走 CDP（`chrome --remote-debugging-port` + 非默认 `--user-data-dir`，连 localhost 带 `NO_PROXY`）。

## 9. 待决

1. ~~选 A / B / C~~ → 已选 **A**（2026-10-01，维护者「按推荐来做」）。
2. 方案 A 的 `::before` 面是否要顺带把面板也纳入 14px 圆角族 → **已纳入**（`[data-trigger-menu]` 进了
   `[data-dsh-glass-float]` 的 14px 家族；它没有 `role`，此前落在家族之外）。
3. 是否需要在上游开一条 issue（「`data-trigger-menu` 与 filtered 祖先」）——注意这是**本皮肤触发的**上游形态耦合，
   上游自身没有该问题（stock 的 composer 卡不带 `backdrop-filter`，面板模糊照常工作）。**仍未决**
   （上游 `MenuSurface` 的注释说明上游自己知道 backdrop root 这回事，且它已把自己的面拆开，故更像「宿主约定」而非缺陷）。

## 10. 实施结果（方案 A，2026-10-01）

### 改了什么

| 文件 | 位置 | 改动 |
|---|---|---|
| `src/client/glass/glass.module.css` | 云母 composer 配方（现 `:465-528`） | 卡本体：`isolation: isolate` + `background: none` + 只留外投影（`--dsh-glass-drop`）；新增 `[data-composer-card]::before` 材质面（`inset:0`、`z-index:-1`、`border-radius:inherit`、`--dsh-glass-card` 填充 + `--dsh-glass-edge` 内侧高光 + blur） |
| 同上 | 云母分栏态（现 `:545-586`） | `[data-dsh-glass-inputbar]:has([data-dsh-glass-stats])` 加 `position: relative; isolation: isolate`、去掉填充与 blur、只留外投影；新增 `::before` 材质面；补一条 `…[data-composer-card]::before { display: none }` 让内层材质面让位（两层会叠两份填充 + 两次 backdrop 回读） |
| 同上 | 兼容模式（现 `:933-950`） | 卡从「blur 家族」「填充家族」里退出，改为独立规则：`isolation: isolate` + `background: none` + `backdrop-filter: none` + `::before` 材质面（`--dsh-glass-card-raised` + `blur(12px)`，**不**加内侧高光——compat 原本就没有）；`outline` 的 rim 保留在卡本体（outline 画在负 z 子层之上，照样勾边） |
| 同上 | 14px 圆角族 | 加入 `[data-trigger-menu]` |
| 同上 | 兼容模式的 `blur`/填充/描边三条家族规则的长注释 | 补 issue #19 的退出理由；§「compat 也 blurs composer」那句改成指向 `::before` |
| `src/client/glass/glass-css.gen.ts` | — | `node scripts/gen-glass-css.mjs` 重生成 |
| `tests/glass-css.spec.ts` | 新增 `describe('backdrop-root hygiene (issue #19)')` | ① `backdrop-filter ≠ none` 的规则不得命中 `[data-composer-card]` / `[data-dsh-glass-inputbar]` **本体**（`::before` 例外，且这里排除了「祖先选择器里含该钩子」的误判）；② 活跃材质面恰好 3 条 + 让位规则恰好 1 条，且每条活跃面必须同时拥有 `background`；③ 宿主本体不得画填充（只允许 `none`/`transparent`）。`VISIBLE` 名单把 `[data-composer-card]` 换成 `[data-composer-card]::before`；#16 用例里「compat 卡必须被 blur 命中」改成锁「compat 材质面存在且是 `blur(12px)`」（jsdom 的 `querySelectorAll` 取不到伪元素） |
| `scripts/e2e-boot-check.cjs` | 关键区域采样 3 / 新增 3b | 「盖住内容的面保留 blur」改读 `::before` 的计算值；新增：输入 `/` 唤起面板 → 断言 `[data-trigger-menu]` 的**每一层祖先** computed `backdrop-filter` 都是 `none`（无 composer / 面板未弹出时如实记 skipped） |
| `AGENTS.md` | 硬规则 4 | 补「推论二：不要把 blur 加在托管浮层的容器上」+ 材质面必须整体搬家 + `isolation` 不是 backdrop root |
| `README.md` | 兼容模式命中表 | 输入框卡片那行注明材质在 `::before` |
| `CHANGELOG.md` | `[Unreleased]` → 修复 | 一条（含实测数字与英文摘要） |

### 实测（离线整页 fixture，真实样式表 + 上游菜单 CSS）

fixture 生成器：`.debug/issue-19/make-fixture.mjs`（**不入库**），把 `glass.module.css`（旧版由
`git show HEAD:…` 导出到 `.debug/issue-19/old-glass.module.css`）+ 上游 `MenuSurface/MenuView/InputBar`
的 CSS 子集 + 真实 DOM 骨架（`root > card[data-composer-card] > overlayAnchor > [data-trigger-menu] > .material`）
拼成两版页面，转录是**内容层**的高频条纹（不是画布背景——画布背景不在面板的 backdrop 里，且会被本皮肤的
纯色地面盖掉，这一点踩过一次）。报告人配置：mica + `blur 2` + `frost 20`(=0.4×) + Latte。

| 采样带（无行文字） | 旧 sheet | 新 sheet | 变异（去掉面板自身 blur） |
|---|---|---|---|
| 面板区 · 普通卡 | **31.58** | **0.00** | 32.06 |
| 面板区 · 分栏态（stats 行） | **33.03** | **0.54** | 33.43 |
| 同页裸转录（对照） | 76.32 | 76.32 | 76.32 |

`stdev` = 该带亮度标准差，条纹越清晰越大。结论：修前面板底下是**清晰条纹**（=报告人的截图），修后同一带
**完全糊平**；变异测试回弹，证明是 blur 在画而不是不透明填充；对照带三轮不变，证明页面本身没动。

祖先链（同一 fixture 的 `getComputedStyle` dump）：

| | 面板的祖先里带 filter 的那一层 |
|---|---|
| 旧 sheet · 普通卡 | `div[data-composer-card]` → `blur(2px)` |
| 旧 sheet · 分栏态 | `div[data-dsh-glass-inputbar]` → `blur(2px)` |
| 新 sheet（两种） | **无**（整条祖先链 `none`） |

### 还没做的验证

1. **真机一轮**（`AGENTS.md` 的 e2e 跑法）：采样 3b 的祖先断言 + 报告人配置目视 + `signature` 级回归。
   本机 Node 不能 spawn ⇒ 本轮用离线 fixture 代替；真机那轮必须补。
2. **composer 自身的像素 A/B**（方案 A 的固有风险：模糊住的合成层从「卡」换成「伪元素」，卡内文字移出被过滤的分组）。
   离线 fixture 里 `y315-325`（卡内输入区）旧 **26.41** / 新 **27.03**，差异 2% 量级，未见位移与色偏；
   真机上仍要按 issue #13 的手法（隐藏面自身内容后 A/B）跑一遍。
3. **分栏态的 `position: relative`**：上游 `.uV2eYG_root` 是 `display:flex` 的 static 元素，栏内绝对定位元素
   （`overlayAnchor`、`placeholder`、`cardWorkspaceTrigger::after`）都在已定位的 `uV2eYG_card` 内 ⇒ 预期不改变参照；
   真机上确认一次（离线 fixture 里我不得不用 `!important` 才压得住这条新规则，正说明它确实生效）。
