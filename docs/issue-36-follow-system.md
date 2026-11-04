# issue #36 — 跟随系统深/浅色自动切换（已实施）

> 状态：**已按 C′ 实施（2026-11-04）**，报告人 `aurasuisui`（同一人也报了 #31 / #32 / #34）。
> 真机取证见 §8.2；版本号留给发版时定（按 `AGENTS.md` 应为 `0.7.0`）。
>
> 维护者 2026-11-04 拍板：走 C′（浅色锁 Latte + 深色显式下拉）。原待裁决三问的答案记在 §7。

## 1. 报告内容与现状

| 现状 | 实测依据 |
|---|---|
| 选了任一风味后，Windows 切深/浅，界面不动 | 偏好被钉成风味 id，见 §2 链路 |
| 风味行的「跟随系统」= 关掉插件、回退官方偏好 | `select('off')` → `applyRestoredPreference(readRestoredPreference())`，`src/client/index.ts:1073-1092` |
| 想「白天 Latte / 晚上 Mocha」只能手动切两次 | 无任何 OS 监听 |

README.md:200 的「跟随系统」就是这个「关闭」语义 —— **命名冲突是真的**，不是报告人误解。

## 2. 根因：三层链路把 `prefers-color-scheme` 掐死了

1. `ui-theme` 的 `ThemeRuntime` 只在 `preference === 'system'` 时响应媒体查询
   （`dsh-client-ui-theme/lib/client.js:1665-1670`：`media` 的 `change` 回调首行就是
   `if (this.preference !== 'system') return`）。
2. `ui-layout` 的 `ThemePresenter.apply()` 把 `html[data-ds-theme-source]` 写成
   `preference === 'system' ? 'system' : active.colorScheme`（`dsh-client-ui-layout/lib/client.js:549-563`）。
3. 桌面壳 `preload-app.cjs` 把这个属性镜像进主进程 `nativeTheme.themeSource`。

⇒ 一旦 `setTheme('catppuccin-mocha')`，`themeSource` 被钉成 `dark`，渲染进程的
`prefers-color-scheme` 从此恒为 dark，监听器一次也不会再触发。**所以「监听
`prefers-color-scheme` 再 `setTheme`」这条路从结构上不成立**，不是写法问题。

另一半原因：`ThemeDefinition.colorScheme` 是**单个**值（`dsh-client-ui-theme/lib/types/client/index.d.ts:47-51`），
一个注册主题只能声明自己是 light 或 dark，天然表达不了「跟着 OS 二选一」。

## 3. 可行机制：不切主题，叠 override 层

`ThemeRuntime.overrideTokens(source, tokens)`（同在 `index.d.ts:184-200`，本仓库 devDeps
`@deepseek-ai/dsh-client-ui-theme@0.2.1-rc.2` 已有此 API）的契约是：

- `tokens` 是 `token → { light, dark }` 成对的值，裸字符串会抛带解释的 `TypeError`；
- `composeActive()` 按**当前 active 的 colorScheme** 取对应那一半
  （`lib/client.js:1868-1875`），并且**只覆盖 base 里同名的 token**；
- 同一个 `source` 再调一次 = 整层替换并重新压栈顶。

于是「跟随系统」可以这样成立：

- 偏好留在 `system`（`theme.setTheme('system')`），`active` 永远是官方 light/dark，
  由 OS 解析；媒体监听器继续有效，Presenter 继续把 `data-ds-theme-source` 写 `system`，
  `nativeTheme` 也跟着 OS ⇒ **原生标题栏、三个窗口按钮、Platform 登录页都自动跟随**；
- 我们叠一层 `{light: Latte 全表, dark: <深色风味>全表}`，Presenter 把合成结果内联写到
  `body`（`dsh-client-ui-layout/lib/client.js:572-579`），OS 一变就换另一半。

代价：`preference` 从风味 id 变成 `system` 期间**没有任何注册主题是 active**，
所有「active 是不是我们的风味」的既有判断都要单独走一条分支（§5）。

## 4. 传播面：为什么这一层能盖住所有东西

| 面 | 取色来源 | 跟随模式是否成立 |
|---|---|---|
| 宿主主 UI | `body` 内联 token（合成后的） | ✅ 直接生效 |
| `data-ds-dark-theme` / `color-scheme` | 由 `active.colorScheme` 写 | ✅ OS 解析结果 |
| 玻璃层 | `resolveDark()` 读 `active.colorScheme`；CSS 用 `body[data-ds-dark-theme]` + `--dsw-*` | ✅ 两个来源都跟着 OS（`src/client/glass/glass-layer.ts:280-288`） |
| shiki 高亮 token | 注册时合并进 `theme.register` 的 tokens | ⚠️ 跟随模式**不注册主题** ⇒ 必须把两套 shiki 一起放进 override 两层 |
| 首帧预涂（#30 补充） | Host 注入 `<style>` + body 脚本 | ⚠️ 需按 `prefers-color-scheme` 出两套（§5.4） |

## 5. 推荐的实现方案（C′：浅色锁 Latte，深色显式选）

### 5.1 四种取法的取舍

| 方案 | 规则 | 判定 |
|---|---|---|
| A 固定配对 | Latte / Mocha | 零控件，但 Frappé / Macchiato 用户被排除，而这三款正是同一批人的偏好 |
| B 复用当前风味 | 风味行选中项 = 深色端，选 Latte 时回落 Mocha | **否决**：开跟随后点 Latte，屏幕是 Mocha，风味行高亮却在 Latte —— 行在说谎；而且是隐式赋值 |
| C 显式双选 | 浅色下拉 + 深色下拉 | 明确，但「浅色下拉」是假选项：四个风味里只有 Latte 是浅色 |
| **C′（推荐）** | **浅色固定 Latte**（常量，不出控件）+ 深色一个下拉（Frappé / Macchiato / Mocha，默认 Mocha）+ 一个「跟随系统」开关 | 零歧义，只多一个控件；控件类型有先例（更新通道、shiki 都用 `SegmentedControl`） |

命名按报告人 Q3 的建议处理：现有那格改名 **「关闭（官方主题）」**，
新开关叫 **「跟随系统深色/浅色」** —— 两者语义彻底分开，老用户不会误解。

### 5.2 数据契约（新增两个字段，不改 `flavor` 的枚举）

```ts
followSystem: boolean            // 默认 false
followDark: 'catppuccin-frappe' | 'catppuccin-macchiato' | 'catppuccin-mocha'  // 默认 'catppuccin-mocha'
```

**为什么不把 `'follow'` 塞进 `FlavorValue`**：`FlavorValue` 的语义是「持久化值就是主题 id」
（`src/state.ts:87-99`，`tests/state.spec.ts` 与 `tests/palettes.spec.ts` 都锁着），
塞进去会让 `readFlavor()` / `bootPaletteRows()` / `CATPPUCCIN_FLAVOR_VALUES` 三处同时说谎；
布尔字段对既有不变量零冲击。

**不变量（在 `sanitizeState` 里强制）**：

- `followSystem === true` ⇒ `followDark` 必须是三个深色 id 之一（否则回 Mocha）；
- `followSystem === true` ⇒ `flavor !== 'off'`（关掉插件必然关掉跟随，否则关掉了还在叠层）；
- `followSystem === false` ⇒ 行为与 0.6.7 完全一致（发布承诺）。

浅色端常量：`FOLLOW_LIGHT_FLAVOR = 'catppuccin-latte'`，配一条断言 `colorScheme === 'light'`。

### 5.3 改点清单（按文件）

| 文件 | 位置 | 改什么 |
|---|---|---|
| `src/state.ts` | `CatppuccinState`/`CatppuccinSettingsSection`(187-220)、`defaultState`(286)、`sanitizeState`(342)、`isDefaultState`(410)、`defaultSettingsSection`(430)、`settingsSectionFromState`(442)、`settingsSectionsEqual`(469)、`replayLocalChanges`(523) | 加两个字段；`replayLocalChanges` 的 `carry` 泛型联合要带 `followSystem`，`followDark` 单独 carry。**漏一处是静默的**（该函数注释 506-511 已写明，`tests/state.spec.ts:356` 是漂移守卫） |
| `src/settings-catppuccin.ts` | `catppuccinSchemaFields`(84)、`volatileFields`(125)、`CatppuccinConfig`(166) | 新字段进两个 seam 的表（fresh node，不许共用）；`followDark` 用 `Schema.union([...])` |
| `src/client/state-sync.ts` | `stateToMutateOps`(292) | 加 2 个 `{op:'set', path:[...]}`。**缺了就是滑条 1 秒后弹回**那一类静默故障（同文件 301-320 的注释） |
| `src/client/index.ts` | 新增 `FOLLOW_*` 键与读写（照 103-178 的 localStorage 段）、`applyFollowLayer()`、`applyDesired`(800-840)、`reapplyThemePrefs`(524)、`select`(1072)、`onStorage`(843)、`rememberBuiltinPreference`(185) 调用点、`injected()`(1061) | 核心：**跟随分支**（§5.5） |
| `src/boot-palette.ts` | `bootPaletteStyle`(119)、`bootPaletteScript`(140)、`bootPaletteRows`(151) | 跟随模式出两段 `@media (prefers-color-scheme)`，脚本用 `matchMedia` 而不是风味 `colorScheme` |
| `src/client/CatppuccinRow.tsx` | injected 接口(44-63)、cubes 区(186-225) | 加 `follow`/`setFollow`/`followDark`/`setFollowDark`；点任一风味 cube = 隐式关跟随（显式动作优先） |
| `src/client/locales.ts` | `row.off`(13) + 6 份字典 | 改 `row.off` 文案；新增 `row.follow` / `row.followHint` / `row.followDark`；`tests/locales.spec.ts` 锁 key 集 |
| `README.md` / `README.en.md` | :200 附近 | 第 4 条要改写语义（现在描述的是「关闭」） |

`CatppuccinRow.module.css` 与玻璃 CSS **不需要动**：玻璃的两套取值都跟 `colorScheme` /
`body[data-ds-dark-theme]`，跟随模式下这两者由 OS 决定，规则照旧命中。

### 5.4 跟随模式的层内容

```ts
const light = flavors.byId(FOLLOW_LIGHT_FLAVOR)          // latte
const dark  = flavors.byId(readFollowDark())             // 深色三选一
tokens = {} as ThemeTokenOverrides
for (const name of union(Object.keys(light.tokens), Object.keys(dark.tokens))) {
  tokens[name] = { light: light.tokens[name] ?? dark.tokens[name], dark: dark.tokens[name] ?? light.tokens[name] }
}
// shiki 按各自风味的风格集合并（同 union 规则）
// menuSurfaceFor(hostHasMenuBlur()) 两层同值
// readOverrides() 两层同值（用户的 --dsw-* 覆盖对两半都生效，写入注释）
```

约 190 个 token × 2 半；`composeActive` 只取一半，成本与现状同量级。
需要一条断言：两个风味的 token key 集合一致（若上游加 token 只加到部分风味，union 兜底但不该静默）。

### 5.5 运行时序（每条都要落到测试）

**开启跟随**（同步块，中间不许有 paint）：

1. `dispose` 掉旧层（如果有）；`applyFollowLayer()`；
2. `commitTheme('system', false)` —— **不记录** `liveBuiltinPick`（#31 的教训）；
3. `writeFollowSystem(true)` → `queuePersist()` → `clearBootPalette()`。

**关闭跟随**：`dispose()` 层 → `ensureThemeRegistered(flavor)` → `commitTheme(flavor, false)` → 落盘。

**OS 变化**：`theme/change` → `applyDesired` → 跟随分支只做「层还在 + 偏好是 system」的确认，
Presenter 自己换另一半。**不要**在这里重写层（会白白触发一次 `publish`）。

**`applyDesired` 的跟随分支**（插在现有 `if (desired === 'off')` **之前**）：

```ts
if (readFollowSystem()) {
  clearBootPalette()                       // 预涂片必须退休，理由同 830
  if (!followLayerActive) applyFollowLayer()
  const preference = theme.getTheme().preference
  if (preference !== 'system') {
    if (builtinPickWins(preference, liveBuiltinPick)) return   // 本会话显式点过官方浅/深 → 让它赢
    commitTheme('system', false)
  }
  return
}
```

这段是从现有 800-840 的骨架里长出来的，**不能**把它塞进 `if (preference === desired)`
那条早退（`desired` 是风味 id，跟随模式下恰好不相等，会一路掉到 `scheduleRestore` 把层撕掉）。

**`rememberBuiltinPreference` 的坑（本方案特有）**：`applyDesired` 第一行就会记录
`theme.getTheme().preference`；跟随模式把它设成 `system` 之后，用户原本记得的 `dark`
会被 `system` 覆盖，于是「关闭」时还原成 system 而不是他自己的深色。修法：跟随模式跳过这次记录。

**`reapplyThemePrefs`**：现在 `flavorInfo(active)` 在跟随模式下是 `undefined` 会直接 return，
所以改 overrides / shiki 时层不重建。改成：跟随模式 → 重新 `overrideTokens`（同 source 替换即重压栈）。

**`onStorage`**：新增两个 key 的分支，逻辑与 `flavor` 一致（另一窗口开了跟随 ⇒ 本窗口跟上；
关了 ⇒ 回到固定风味）。跨窗口这条最容易漏，`#31` 就是同类。

### 5.6 首帧预涂（#30 补充）

跟随模式不能只涂一套：

```html
<style data-dsh-catppuccin-boot>
  :root{color-scheme:light dark}
  html body{<Latte 全表>}                                   /* 默认浅 */
  @media (prefers-color-scheme: dark){ html body{<深色风味全表>} }
</style>
```

body 脚本改成 `document.body.toggleAttribute('data-ds-dark-theme', matchMedia('(prefers-color-scheme: dark)').matches)`。
Host 侧 `bootPaletteRows` 需要读 `config.followSystem` / `config.followDark` 两个 volatile 引用
（两个字段都要在 `Config` 里 `.volatile()`，否则 Host 读不到持久值，只会拿到 patch 默认值）。

### 5.7 能力探测与降级

`overrideTokens` 在 0.2.1-rc.2 就有，但**最低支持窗口（0.1.5 线）没有验证过**。
规则：`typeof theme.overrideTokens !== 'function'` ⇒ 不渲染「跟随系统」开关（而不是渲染了点了没反应），
并在 `docs/` 记一行探测结果。这个探测发生在 `apply` 里，行注入时传一个 `followAvailable: boolean`。

## 6. 风险与边界

| 风险 | 处理 |
|---|---|
| 开启跟随把官方 `ui-theme.preference` 改成 `system`（不可逆的用户设置变更） | 关闭跟随走「回到固定风味」；若用户从未选过风味则走现有 `readRestoredPreference()`。文档要写明 |
| 本会话在官方 Appearance 行显式点了浅/深色 | `builtinPickWins` 让它赢，跟随暂时让位（同现有「boot 窗口让位文档」的先例），下次 reload 回到 `system`。**不要**在 `theme/change` 里回写持久字段（#31 的竞态来源） |
| 与 #31 回声竞态叠加 | 层重建必须同步完成；`overrideTokens` 的 disposer 只对「自己那一层」生效（新层压上来后旧 disposer 是 no-op），不要手写「先删再建」的异步序列 |
| `FlavorValue='off'` 与跟随互斥 | 在 `sanitizeState` 里强制，并加断言 |
| 官方主题色被用户 overrides 打到同一 token | 两层同值，语义是「用户覆盖优先于风味」，与现状一致，写进注释 |
| 报告人的原型已 406 测试全绿 | 拿它的 diff 当参考，但**不要**直接合并：他做的是 B（`applyDesired` 早退），与本方案的 C′ 在行 UI、持久字段上都不同 |

## 7. 维护者裁决（2026-11-04）

1. **选项 = C′** —— 浅色锁 Latte（常量，不出控件）+ 深色端下拉（Frappé / Macchiato / Mocha，默认 Mocha）+ 一个开关。
2. **发版**：按 `AGENTS.md`「特性走 0.7.0」；本次改动进 `[Unreleased]`，版本号在发版提交里定。
3. **命名**：现有「跟随系统」已改为「关闭（官方主题）」，新开关叫「跟随系统深色/浅色」（七份字典 + 两份 README 同步）。

实现落点与 §5.3 一致，另外两处实施时才暴露的细节：

- `applyDesired` 的跟随分支必须**在 `rememberBuiltinPreference` 之前分流**，否则跟随把偏好设成 `system` 之后，
  下一次 `applyDesired` 会把 `system` 记成「用户原本的官方偏好」，导致「关闭」还原成 system 而不是用户的深色。
- 层刷新统一走 `syncFollowLayer()`，用内容签名去重：`overrideTokens` 每次调用都会 `publish`，
  不去重的话 OS 每次切换都会多打一次 `theme/change`。

## 8. 验证

### 8.1 单测（`pnpm test` 需 `--no-file-parallelism`）

| 文件 | 断言 |
|---|---|
| `tests/state.spec.ts` | 两字段的 sanitize 边界；`followSystem && flavor==='off'` 归一；`replayLocalChanges` 漂移守卫（现有 356 行的机制会直接抓住漏 carry）；`isDefaultState` 不会把「只开了跟随」当成用户选择 |
| 新增 `tests/follow-layer.spec.ts` | 层内容：union 覆盖两风味全部 token、每项都是 `{light,dark}` 两串、shiki 按各自风味、overrides 两层同值、`menuSurfaceFor` 两层同值；两个风味 key 集一致 |
| `tests/client.spec.ts` | 开启 → `setTheme('system')` 且 `liveBuiltinPick` 未被记录；关闭 → 层被 dispose 且回到固定风味；OS 变化不重写层；`applyDesired` 在跟随下**不**调 `scheduleRestore` |
| `tests/boot-palette.spec.ts` | 跟随模式两段 `@media`、脚本用 matchMedia、`off`/固定风味的老输出逐字节不变 |
| `tests/rows.spec.tsx` | 点风味 cube 隐式关跟随；`off` 同时清两个字段；开关在 `followAvailable=false` 时不渲染 |
| `tests/locales.spec.ts` | 新 key 六语言齐；`row.off` 新文案 |
| `tests/settings-seam.spec.ts` | 新字段在 legacy / new 两个 seam 都存在且 volatile 标记正确 |

### 8.2 真机（这是唯一能证明「跟随」成立的证据）

1. `env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS "./DeepSeek Harness.exe" --remote-debugging-port=9333`；
2. 开跟随 + 云母，`cdp.mjs eval` 采样：`getComputedStyle(document.body).getPropertyValue('--dsw-base-background')`、
   `html[data-ds-theme-source]`（应为 `system`）、`body[data-ds-dark-theme]` 是否存在；
3. 用 PowerToys Light Switch（`Win+Ctrl+Shift+D`）或系统设置切一次，**同一窗口**再采样：
   token 应变、`data-ds-theme-source` 仍是 `system`、玻璃没塌（`data-dsh-glass-*` 归零是窗口 hidden 的老坑，先跑 `stamp.js`）；
4. 标题栏/三个窗口按钮随 OS 变色 = 报告人 Q1 的核心验收点（截图留档）；
5. CDP 侧快速回归：`Emulation.setEmulatedMedia({features:[{name:'prefers-color-scheme', value:'dark'}]})`
   能触发 `matchMedia` 的 `change`，可用于无人值守的 A/B（但**不能**证明 `nativeTheme` 跟随，仍需第 3 步真机）。
6. 回归：#31 快速切风味不回声、#33/#34 的弹层与图片预览、玻璃 `tests/glass-css.spec.ts` 全绿。

#### 实测结果（2026-11-04，官方壳 `0.2.1-rc.5`，Windows 11，视口 1280×822）

探针 `.debug/real-verify/follow-probe.mjs` / `follow-resolved.mjs`（CDP，非 Playwright）：

| 场景 | `data-ds-theme-source` | `colorScheme` / `data-ds-dark-theme` | `--dsw-static-neutral-bluish-00` 解析值 |
|---|---|---|---|
| 跟随开，OS 深色 | `system` | dark / 有 | `#cdd6f4`（Mocha `text`） |
| `Emulation.setEmulatedMedia` → light | `system` | light / 无 | **`#eff1f5`（Latte `base`）** |
| 再切回 dark | `system` | dark / 有 | `#cdd6f4` |
| 关闭跟随（恢复原状态） | `dark` | dark / 有 | `#cdd6f4` |

结论：**跟随模式全程 `themeSource` 保持 `system`**（这正是原生标题栏跟随的前提，旧实现里它会变成 `dark`），
两侧 token 确实分别解析成 Latte / Mocha，且**不需要重载**——媒体监听器一触发，Presenter 就换了另一半。

未做：设置面板里那个开关的**真机截图**（本机没法从 UI 打开设置对话框做点击），
该路径由 `tests/rows.spec.tsx` 的 jsdom 用例覆盖（开关只在 `overrideTokens` 存在时渲染、深色端只列深色风味）。

## 9. 工作量（本机、不含等维护者回复）

| 阶段 | 估时 |
|---|---|
| state / schema / state-sync 三处契约 + 单测 | 1.5–2 h |
| `index.ts` 跟随分支 + 层构建 + `reapplyThemePrefs` / `onStorage` | 2–3 h（竞态是主要成本） |
| 行 UI + 六语言 + README | 1 h |
| boot palette 两套 | 1 h |
| 真机取证 + 文档 + CHANGELOG + 发版 | 1.5 h |

合计 **约 7–9 h**，分两个 patch 落：① 契约+机制（可单测证明）② UI+boot 预涂。
