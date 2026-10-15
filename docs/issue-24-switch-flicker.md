# issue #24 分析与修复方案：切换会话时顶栏 / 对话框的毛玻璃「闪烁」

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/24>（报告人 `TWFU-wcy`，2026-10-15）
- 状态：**根因已定位（本机 CDP 实测复现 + 机制取证）；方案 A 已实施（commit `918f18b`）并随 `0.6.3-beta.0` 发 beta（2026-10-15），见 §10。**
- 报告环境：`dsh web`、主题 `@nonamelego/dsh-catppuccin@0.6.2-beta.2`、玻璃开（未报 mode；按现象推断为 **mica**，理由见 §4）。
- 本机复现环境：web profile（`link:D:\Vibe-Coding\dsh-catppuccin`，即当前 HEAD `679a5a2` = 0.6.2 线）+
  官方 `dsh` 0.2.0-rc.2 + headless Chrome（CDP），配置 `mocha / mica / blur 2 / frost 20`。

> ⚠️ 本文的 `文件:行号` 是写作当时（2026-10-15，HEAD `679a5a2`）的快照——代码一动行号就漂。
> 按位置找代码请用**符号名**（`dsh-glass-in`、`data-phase`、`FactoryOccurrence`）检索。

## 1. 现象与预期

报告人原话（意译）：

> 开启毛玻璃后，**切换会话**时对话框和顶栏的模糊（backdrop-filter）效果**闪烁**：模糊层短暂消失 / 重新应用，有明显闪动感。

预期：切换会话时模糊稳定、连续。

报告人自己的猜测（「缓存/保持模糊层实例，或避免切换时重新应用 backdrop-filter」）方向不对——CSS 没有「缓存模糊层」这回事；
真正被「重新应用」的不是 backdrop-filter，而是**整列 DOM 被上游重新挂载、并被本皮肤自己的入场动画从 opacity 0 重新淡入**（§3）。

## 2. 本机实测（CDP，1440×900@2x）

探针（不入库，`.gitignore` 已覆盖 `.debug/`）：

| 文件 | 作用 |
|---|---|
| `.debug/issue-24/run.mjs` | 零依赖 CDP 驱动（`eval` / `click` 两种模式；`click` 模式同时开 `Page.startScreencast` 收帧） |
| `.debug/issue-24/switch-probe.js` | 页内探针：给会话根/顶栏/输入卡打标记 → 连续切换 4 次会话 → 逐帧记录 phase / 动画名 / opacity / 元素身份 / DOM 变更 / 动画事件 |
| `.debug/issue-24/override-b.css` | 变体 B 覆盖：只杀掉会话根的入场动画（`animation: none !important`），其余不动 |
| `.debug/issue-24/evidence/*.jpg` | 帧证据（A=现状「整列空白」，B=关掉入场动画后「正常」） |

### 2.1 逐点击时间线（变体 A = 现状，无覆盖）

| 事件 | 观测值（第一次切换） |
|---|---|
| 点击会话行 | t = 401 ms |
| `animationstart: dsh-glass-in` @ `div.wSkVaW_root` | **t = 440 ms（+39ms）** |
| 根元素 computed `opacity` | **0.000 → 1.000** 线性爬升（采样：0.001 / 0.428 / 0.614 / 0.789 …） |
| `animationend` | **t = 740 ms（时长 ≈ 300ms）** |
| 元素身份 | `sameRoot / sameHeader / sameCard` 在切换瞬间全部 **False**（整列含顶栏、输入卡都是新 DOM） |
| DOM 变更 | `rem: ['wSkVaW_root']` + `add: ['wSkVaW_root']`（移除再插入，同一批 mutation） |
| screencast 帧 | fade 期间**会话列整列空白**（顶栏/对话框轮廓全无；帧亮度 18.0 = 纯地面，常态 22.7~25.0） |

四次点击（Untitled Session ↔ 查看当前项目状态 来回切）的 `animationstart` 全部在点击后 **39~63ms** 出现，
每次都是同一个 `dsh-glass-in` @ `wSkVaW_root` —— **每一次会话切换都重播一整轮 300ms 的整列淡入**。

### 2.2 配对对照（变体 B = 只关这条动画）

| | 变体 A（现状） | 变体 B（`animation: none`） |
|---|---|---|
| 动画事件 | 每次切换 2 条（start/end） | **0 条** |
| 根 opacity | 0.000 → 1.000 爬升 | **恒 1.000** |
| 顶栏区域帧亮度 | 18.0（空白）→ 18.5 → 20.3 → 23.3（爬升） | 22.4 → 25.0（只随内容切换变化，**无回落**） |
| 整列的顶栏/对话框 | 消失 → 淡入（= 报告人的「闪烁」） | 切换瞬间即完整（见证据帧 B） |

证据帧：

- `.debug/issue-24/evidence/A-current-blank-at-switch.jpg` —— 现状：切换后 ~60ms，**整列空白**（只有侧栏）
- `.debug/issue-24/evidence/A-current-midfade.jpg` —— 现状：fade 中段（顶栏/对话框半透明）
- `.debug/issue-24/evidence/B-no-entry-anim-normal.jpg` —— 关掉动画后：顶栏卡 + 输入卡（`载入历史…`）立即完整呈现

## 3. 根因

**两层，缺一不可：**

**① 上游（0.1.7 与 0.2.0 两线一致）：切换会话会重挂载整棵会话子树。**
`main.conversation` 槽位声明为 `scope: 'session-maybe'`
（`dsh-client-ui-conversation/lib/client.js`：`slots.register({ name: "main", key: "conversation", children: { "main.conversation": { kind: "single", scope: "session-maybe" } } }, ConversationPanel)`；
组件 `ConversationRoot` 即 `div.wSkVaW_root[data-phase]` 的宿主）。
渲染器 `dsh-client-ui-renderer/lib/client.js` 对 `session-maybe` 槽位取
`const maybeEpoch = useMaybeIncarnation(binding)` 并把它当 **React key**
（`jsx(FactoryOccurrence, {...}, maybeEpoch)`；`session` 严格版用 `sessionGenerationKeyOf(binding)`）。
**key 变 ⇒ React 卸载 + 重挂载整棵子树**——这是上游刻意设计（「会话世代」重置全部 per-session 状态），不是缺陷，改不动也不该改。

**② 本皮肤：入场动画挂在「会被重挂载的容器」上。**
`src/client/glass/glass.module.css` 给 `[data-phase='hero']` / `[data-phase='active']` 挂了
`animation: dsh-glass-in`（`from { opacity: 0 }`，0.3~0.32s）。该选择器**永远匹配**，而浏览器对**新插入的元素会自动重放其动画**
⇒ 每次会话切换，新挂载的整列从 opacity 0 淡入。

时序合成：

```
点击会话行 (t≈401)
 └─ 上游：rem wSkVaW_root → add wSkVaW_root（新元素，顶栏/输入卡全新）
     └─ 新元素命中 [data-dsh-glass] [data-phase='active'] 的 animation → 从 opacity:0 开始 (t≈440)
         └─ 整列（含顶栏玻璃卡 + 对话框玻璃卡）淡出淡入 300ms → 报告人看到的「模糊层短暂消失/重新应用」
```

### 排除项（都验过，不是这些原因）

| 猜测 | 排除理由 |
|---|---|
| backdrop-filter 本身失效 / 需要「缓存模糊层」 | 变体 B（**只**删入场动画、backdrop-filter 一行未动）闪烁消失——模糊规则从头到尾都在（`header` 与 `[data-composer-card]::before` 的 computed `backdropFilter` 全程 `blur(2px)`，从未变 `none`） |
| issue #19 的 backdrop root 形态复发 | 那是「模糊读空」的静态缺陷；本 issue 是**动态淡入**，且变体 B 证明与 backdrop root 无关 |
| 0.2.0 上游回归 | `sessionGenerationKeyOf` / `maybeEpoch` 机制 **0.1.7-rc.2 与 0.2.0-rc.2 都有**；入场动画自 `861de85`（玻璃皮肤 0.2.0 首个版本）就在——**长期存在，非新回归** |
| 上游自带动画 | 上游 `ConversationRoot.module.css` 的 `.wSkVaW_root` **没有任何 animation**（整包只有 hero 鱼游动与 input pending 两条）；淡入纯粹是本皮肤加的 |
| 页面边缘 fade 带 / 新会话按钮 | 那些元素在切换时不重挂载（`span[data-dsh-glass-fade]` 挂在 body 下，探针里零动画事件） |

## 4. 可见性条件（为什么报告人看到、别人未必）

| 条件 | 结果 |
|---|---|
| 玻璃开（mica）+ 任意会话间切换 | **必现**（整列 fade 重播） |
| 玻璃开、compat 模式 | 不闪——compat 把时长归零（`--dsh-glass-entry-scale: 0`），动画 0s 无视觉 |
| 玻璃关 | 不闪——`data-dsh-glass` 不存在，规则不命中 |
| 首选会话（hero ↔ active）切换 | 同样重播（`hero` 与 `active` 都被挂了动画，切换时属性变化也会让新元素重放） |

报告人配置里 `blur: 2` 是最小档——玻璃卡的「霜」本来就薄，从 0 淡入时「消失/重新出现」的对比反而更刺眼。

## 5. 修复方案

### 方案 A（推荐）：删掉挂在会话根上的两条入场动画

```diff
- [data-dsh-glass] [data-phase='hero'] {
-   animation: dsh-glass-in calc(0.32s * var(--dsh-glass-entry-scale, 1)) var(--ds-ease-in-out);
- }
-
- [data-dsh-glass] [data-phase='active'] {
-   animation: dsh-glass-in calc(0.3s * var(--dsh-glass-entry-scale, 1)) var(--ds-ease-in-out);
- }
```

- **保留** `[data-testid^='view-']`（视图切换 = 真正的入场，实测会话视图内 0 命中）、`[data-tool]`（卡片进场，见 §8 待决 2）、
  `[role='dialog']`（弹窗开启 = 真正的入场）；`@keyframes dsh-glass-in` 与 `--dsh-glass-entry-scale` 均继续被这三条使用，不删。
- 顺带修 `@media (prefers-reduced-motion: reduce)` 块的选择器名单（去掉这两条，余下三条保留）。
- 代价：**开机首帧不再有淡入**（会像 stock 一样直接出现）。这正是上游行为；该淡入是一次性 0.3s 装饰，与「每次切换都闪」对冲不划算。
- 收益：切换会话回到与 stock 逐帧一致；不引入任何 JS / 属性 / 时序机制；测试护栏一行可写。

### 方案 B（备选：必须保留开机淡入时）

「只在启动期播放、之后永久失效」——给 `html` 加一个一次性门控属性（如 `data-dsh-glass-boot`），
CSS 门控改为 `[data-dsh-glass][data-dsh-glass-boot] [data-phase='…']`，插件在启动后 **且当前没有正在跑的 `dsh-glass-in` 时**
摘掉该属性：

```js
const clear = () => {
  const running = [...document.querySelectorAll('[data-phase]')].some((el) =>
    el.getAnimations().some((a) => a.animationName === 'dsh-glass-in' && a.playState === 'running'))
  if (running) return setTimeout(clear, 400)   // 绝不在动画在跑时摘属性 → 否则中途取消 = 一次跳变（把要修的闪变成另一种闪）
  document.documentElement.removeAttribute('data-dsh-glass-boot')
}
setTimeout(clear, 1200)
```

- 风险：这正是本仓库记录过的那类「`animation-name` 随属性翻转」的坑（2026-10-01 修过一次）；
  上面用「在跑就不摘」的守卫绕开取消跳变，但多了一个计时器 + 一次渲染期竞态，测试面也大一档。
- 结论：只有维护者认为「开机淡入」是必须保住的观感时才选 B，否则走 A。

### 不采纳

| 选项 | 为什么不行 |
|---|---|
| C1 缩短时长 / 降低幅度（如 0.1s / from 0.6） | 每次切换仍旧闪，只是快一点——治标 |
| C2 给会话根加 `contain` / `will-change` | 不动根因（动画还在重播），且有 issue #19 记录过的 containing block / 渲染副作用 |
| C3 只删 `hero` 保留 `active` | 新会话 ↔ 会话来回切（报告人的场景）仍然闪 |
| C4 「缓存模糊层」「避免重新应用 backdrop-filter」 | CSS 无此机制；backdrop-filter 本来就是合成期每帧读取，问题源头在 opacity 动画 |

## 6. 涉及文件与代码位置（实施清单）

| 文件 | 位置（HEAD `679a5a2`） | 改什么 |
|---|---|---|
| `src/client/glass/glass.module.css` | `824-830`（`[data-phase='hero']` / `[data-phase='active']` 两条动画规则） | **删除**（连同 §5 的说明要求） |
| 同上 | `787-815`（`Page transitions` 大字注释块） | 补 issue #24 记录：上游按 session key 重挂载会话子树（引用 §3 的符号名），任何挂在 `[data-phase]` 上的 opacity 动画都会每次切换重播；附本机实测数字（+39ms 起播 / 0→1 / 300ms） |
| 同上 | `1046-1054`（reduced-motion 块） | 选择器名单去掉 `[data-phase='hero']`、`[data-phase='active']` |
| `src/client/glass/glass-css.gen.ts` | — | 生成物，改完 CSS 跑 `node scripts/gen-glass-css.mjs` 重新生成并提交 |
| `tests/glass-css.spec.ts` | `306-354`（`gates the entry animations on the layer…`） | 断言数 `5 → 3`；**新增一条**：遍历所有含 `animation:` 的规则，断言**没有** selector 命中 `[data-phase]`（会话根不得有入场动画，issue #24）——这条在修前必红、修后必绿 |
| `scripts/e2e-boot-check.cjs` | `460-500`（切回云母的动画采样段） | 新增一条行为断言：`[data-phase]` 的计算 `animation-name === 'none'`；可选：点「新会话」触发一次真实重挂载后，断言 80ms 内无 `dsh-glass-in` 起播（重挂载复用同一采样写法） |
| `CHANGELOG.md` | `[Unreleased]` → 修复 | 一条（走 `0.6.3`，修 bug 不升 minor）：删会话根入场动画 + 实测数字 + 英文摘要 |
| `AGENTS.md` | 硬规则 4 的推论区（或紧随其后） | 补一条推论：「**不要给随会话切换重挂载的容器加入场动画**——上游用 session 世代 key 重挂载 `main.conversation` 整棵子树，挂在 `[data-phase]` 上的动画每次切换都会重播（issue #24）」 |
| `docs/issue-24-switch-flicker.md` | 本文 | — |
| `docs/plugin-improvements.md` | `252` / `761` 附近（「hero 入场动画」的描述） | 若走方案 A：加一句「该入场动画已于 issue #24 移除（会话切换重挂载导致重播）」 |

## 7. 验证步骤

1. **单测（秒级，本机需 `--no-file-parallelism`，链接穿透故障见记忆）**
   `pnpm vitest run tests/glass-css.spec.ts --no-file-parallelism` → 全绿。
   **变异验证**：把两条规则临时加回 → 新增断言必须**红**（本项目铁律）。
2. **重新生成 + 构建**：`node scripts/gen-glass-css.mjs`（产物入库）→ `npx tsdown`（或 `pnpm build`）→
   `grep -n "data-phase" src/client/glass/glass-css.gen.ts` 应只剩布局/圆角规则，无 `animation`。
3. **真页复测（本机 CDP，命令与 §2 一致）**：
   - 起 GUI：`node "$APPDATA/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --no-open --port 3080`（web profile 已 link 本仓库，`pnpm build` 后即生效；改配置走 `~/.dsh/profiles/web/cordis.patch.yml`）
   - 起 Chrome：`chrome --headless=new --remote-debugging-port=9333 --user-data-dir=…`（后台任务方式）
   - 跑 `DSH_WEB_URL='<token url>' node .debug/issue-24/run.mjs click .debug/issue-24/switch-probe.js`
   - **通过判据**：`frames[].rootOpacity` 恒 `1.000`；`animEvents` 为空；帧亮度不出现 18.0 的空白帧（即变体 B 那组数字：22.4 → 25.0 平滑）。
4. **e2e（CI，`node scripts/e2e-boot-check.cjs`）**：新增断言绿；整轮无回归。
5. **真机目视（报告人同款配置：mica + blur 2 + frost 20 + mocha）**：会话之间来回切 ≥5 次 + 新会话 ↔ 会话，
   顶栏与对话框不应有任何闪动；后台开 DevTools Performance 面板确认切换期间无 `dsh-glass-in` 动画记录。
6. **回归面**：玻璃关 / compat / 设置里开关总开关 / 打开设置弹窗——除「开机首帧不再淡入」外不应出现任何差异
   （开关切换本来就是真入场，动画规则未动，不受影响）。

## 9. 实施结果（方案 A，2026-10-15）

### 改了什么（未提交，等发版一起走）

| 文件 | 改动 |
|---|---|
| `src/client/glass/glass.module.css` | 删除 `[data-dsh-glass] [data-phase='hero']` / `[data-phase='active']` 两条动画规则（原位留一行指针注释）；`Page transitions` 注释块补 issue #24 记录（含实测数字与符号名）；reduced-motion 名单同步去掉这两条选择器（剩 view / tool / dialog 三条） |
| `src/client/glass/glass-css.gen.ts` | `node scripts/gen-glass-css.mjs` 重生成（生成物入库） |
| `tests/glass-css.spec.ts` | 入场动画计数断言 `5 → 3`；新增「含 `animation:` 的规则不得命中 `[data-phase]`」护栏（issue #24），注释里写明重挂载机制与证据出处 |

### 验证（全过）

| 项 | 结果 |
|---|---|
| `tsc --noEmit`（tsconfig.json / tsconfig.vitest.json） | 双绿 |
| `tsdown` 构建 | `lib/client.js` 重新产出；`grep "data-phase=hero" lib/client.js` = 0；reduced-motion 只剩三条选择器 |
| 单测 `tests/glass-css.spec.ts` | **22/22 通过** |
| **变异验证**（把规则加回去再跑） | 目标用例 **必红**（实测红），随后还原 |
| 全量单测（`--no-file-parallelism`） | **289/289，20/20 文件**（期间另修了一个**与本次无关**的本机环境问题：`vite` 缺 `postcss`/`yaml` → 6 个 import CSS 的套件报 `Cannot find module '/src/….module.css'`；stash 对照已确认为既存问题，补齐后恢复全绿） |
| web GUI CDP 复测 | `[data-phase]` computed `animationName: none`；注入样式表内已无 `[data-phase=…]{animation…}`；切换探针连点 4 次会话：`rootOpacity` **恒 `1.000`**、**零 animation 事件**、帧亮度无回落到空白（修复前：0.000→1.000 爬升 + 每切必 2 条动画事件 + 整列空白帧） |

### 还没做

1. **桌面壳目视**：`~/.dsh/profiles/desktop` 已是 `link:` 态（指向本仓库）⇒ 壳重启即加载新 `lib/`；但**本轮无法从工具上下文把壳拉起来**
   （2026-10-15 实测：bash 后台启动 → 进程存活但 `HWND=0`、零子进程、零日志；`Start-Process` / `cmd start` → 立即退出；事件日志无崩溃记录；
   `--remote-debugging-port` 被壳以 `bad option` 拒绝）⇒ 改由**用户手动双击启动**后目视：切会话时顶栏卡 + 输入卡应不再闪。
2. CHANGELOG / 版本号（`0.6.3`）/ AGENTS 推论条目：**待与发版一起做**。

## 10. 待决

1. **A vs B**：是否接受失去开机首帧淡入？（推荐 A：与 stock 一致、零机制；B 只在「必须保住开机淡入」时采用。）
2. **`[data-tool]` 的 rise 动画**：实测每次切回会话，工具卡全部重新挂载并重播 `dsh-glass-rise`
   （`.debug/issue-24/tool-probe2.js`：15 张卡 `stamped → 0`，`running`）。它不在本次投诉范围（在转录区内、观感像「内容加载」），
   建议**本轮保留**；若要一并收掉，同法从该规则删除 `animation` 即可（回归风险更低的一步，可另开小 issue）。
3. 是否顺带在上游开 issue：「session 世代重挂载 + 第三方入场动画」的宿主约定？——判断同 issue #19 §9 第 3 条：
   上游这么做是**有意设计**，皮肤侧适配即可，**倾向不开**。
