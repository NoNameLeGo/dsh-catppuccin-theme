# Changelog

本项目的所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（`0.x.y` 正式版，
`0.x.y-beta.n` 预发布 → `beta` npm 标签）。

## [Unreleased]

### 修复

- **覆盖编辑器的值输入改为失焦提交（TT）**：此前值输入受控 + 逐键提交，而「空值 = 删除」→ 想改颜色时逐字符清空会在中途把整行（含正在打字的输入框）卸载、光标丢失；同时**每个字符都会 dispose 并重新注册一次主题**（700 个 token 的表），中间态（如 `#89b4`）还是无效 CSS。现在键名与值都是非受控 + 失焦提交：清空后失焦才删除，打字期间行稳定、主题不再逐键重建；7 语言的 `row.overridesHint` 已同步为「失焦生效」。**有意接受的取舍**：不再「边打边变色」（粘贴完整色值不受影响）、焦点未离开就关弹窗时最后一笔不提交、其它标签页 / settings 文档写入的值需重开弹窗才刷新——三者与既有键名输入完全一致。（EN: the override editor's value field now commits on blur like the key field — clearing a value no longer unmounts the row mid-typing and typing no longer re-registers the theme per keystroke）

## [0.5.2] - 2026-09-15

### 修复

- **自定义 token 覆盖的非法键名不再被静默清除**：`readOverrides()` 现在与 settings 文档走同一个 `sanitizeOverrides`，localStorage 与持久化文档永远同形状——此前键名不以 `--` 开头（例如漏了短横线的 `dsw-static-blue-500`）只存在于 localStorage，hydration 比对时两边不等，走「文档胜出」分支把整份覆盖回写为空，用户刚输入的那行约 300ms 后自行消失。设置行的键名输入改为失焦提交并要求 `--` 前缀（中间态不再被逐键重写成非法键）。（EN: sanitize token overrides on read too — localStorage and the settings document share one shape, so a key typed without the `--` prefix is no longer wiped by the hydration's "document wins" branch）

- **更新检查失败的自动重试真的只重试一次**：此前只要检查失败就排 30s 定时器，重试再失败又排一次——断网时设置行每 30s 打一次宿主路由（宿主失败不缓存，等于每 30s 真打一次 npm），倒计时永不消失。现在每次用户发起的检查只带一次自动重试预算（手动点击复位），并补上倒计时 ticker 在卸载时的 `clearInterval`。（EN: the failure auto-retry now stops after one retry as documented, and the countdown ticker is cleared on unmount）

- **暗色下 success / warn 芯片的标签对比度不足（VV）**：`state-success-tertiary` / `state-warn-tertiary` 是**标签下面的着色表面**（官方 `contextGreen` / `warn-label` 芯片），但 `greenPlan` / `amberPlan` 的 900 步只能混向 `base`，暗色三风味实测标签对为 **3.67/4.37/5.02（success）与 3.18/3.79/4.34（warn）**——既低于 AA，也低于上游官方同对（**5.25 / 5.53**，本次用 `dsw-tokens.json` 实测）。现按 issue #11 的同款机制给 900 步加**混色目标**：暗色混向 `crust` 取 **18%**（扫描 10→30%：14% 过冲到 6.3~9.3、22% 时 Frappé 琥珀只剩 4.54:1，18% 落在上游比值带 4.96~8.30），Latte 保持原样（它的 900 步是浅色芯片配深标签，官方本身 2.09 / 2.58，属上游设计特性）。新增 `tests/palettes.spec.ts` 的 `dark status tint readability (VV)` 两条断言（旧表失败、新表通过）。（EN: repaint the dark success/warn chip tints toward crust — 3.18–4.37:1 before, 4.96–8.30:1 after, matching upstream's ratio band instead of overshooting）

- **玻璃接缝 stamper 的 dispose 契约补严**：`dispose` 能断开 MutationObserver、取消已排的帧，但**已经作为微任务排队的 observer 回调收不回来**——该回调会在 dispose 之后重新排帧并 stamp。加 `disposed` 守卫（`schedule()` 先查）让 dispose 成为终局；同时修掉 `tests/glass-seams.spec.ts` 里的**跨测试污染**（一个用例开了 stamper 从不 dispose、另一个的 `setAttribute` spy 不还原，残留的全局 observer 会去 stamp 后续用例的按钮）——那才是全量 / 干净环境下该用例间歇失败的真正原因。（EN: tighten the seam stamper's dispose contract and fix the cross-test observer/spy leak that made the dispose case flaky）

### 改进

- **设置弹窗玻璃化的 seam 不再依赖宿主构建哈希**：`[class*="VOzbGW_overlay"]`（dsh-client-ui-settings-general 的 CSS Module 哈希，宿主改样式即失效且无声）换成 `:has(> [role="dialog"][aria-modal="true"])`——命中同一个覆盖层元素，键的是稳定的无障碍属性。测试同步改为断言真实属性组合，并断言无 `aria-modal` 的普通 dialog 不被命中。（EN: the settings-dialog glass seam keys off role/aria-modal instead of the host's CSS-module hash）
- **`pnpm changelog:gen -- --write` 不再因缺少 `[Unreleased]` 节中止**：发版会把该节落成版本节，脚本现在在缺失时自动补建在最新版本节之上（此前直接 `exit 1`，而 AGENTS.md 的 SOP 正是让 Agent 跑这条命令）。（EN: the changelog writer recreates the [Unreleased] section instead of aborting after a release consumed it）

- **测试类型检查链路接上（UU）**：`tsconfig.vitest.json` 的注释承诺「src + tests 一起类型检查」，但三条链路都不跑它：`pnpm typecheck` 的 include 只有 `src`、vitest 用 esbuild 转译不做类型检查、CI 只有 install/build/test——4 处既有类型错误因此长期隐形。现在修掉这四处（**不动生产签名**：`builtinPickWins` 是 issue #6 的回归守卫，改在测试内取它的参数类型；`reentrancy` 的 double 用 `as unknown as ThemeSnapshot` 并注明它只建模插件读取的字段；`versions` 用可选链），新增 `pnpm typecheck:tests`，并在 CI 里加 `Typecheck` 步同时跑 `typecheck` 与 `typecheck:tests`（src 侧此前同样从未被检查过——不接 CI 必然再次腐烂）。**接上链路后的第一次 CI 运行就抓到一个真问题**：`state-sync.ts` 从 `@deepseek-ai/dsh-api-remotes/client` 引类型，但该包从未声明——本地能解析只因为 TS 会向上找到工作区父目录的 `node_modules`（幽灵依赖），干净安装直接 `TS2307`。现已补进 devDependencies（仅类型引用，运行时不需要）；`0.5.2` 的 tag 也因此重指到修好后的提交。（EN: wire the test type-check chain — the 4 latent errors are fixed, CI runs both typechecks, and the first run caught an undeclared phantom type dependency）

- **CI 的 pnpm 版本只留一处**：上一批给 `package.json` 加了 `packageManager: pnpm@10.33.3`，而 workflow 里还留着 `version: 10`——两者字符串不等，`pnpm/action-setup` 会直接抛 `Multiple versions of pnpm specified`，**发版会在第二步就失败**（发版前检查时发现）。按官方用法删掉 workflow 的 `version`，pnpm 版本由 `packageManager` 单点决定；AGENTS.md 的故障排查补上了这条坑。（EN: single source of truth for the pnpm version — the workflow no longer duplicates packageManager）

- **无障碍：玻璃旋钮的滑杆补 `aria-valuetext`（Z）**：`<input type="range">` 此前只播报裸数字（「20」）且不带单位。按评估后的**零文案版**补 `aria-valuetext={`${value}${unit}`}` → 屏幕阅读器念「20%」/「14px」，与视力用户所见一致；**不为 3 个旋钮 × 7 语言新增 21 条档位文案**，定性档位名（「中等磨砂」）保留为可选后续，只在真有屏幕阅读器用户反馈时再做。（EN: range knobs announce their unit via aria-valuetext without adding 21 locale strings）

## [0.5.1] - 2026-09-13

### 修复

- **修复深色模式下分段选择器选中项不可读（issue #11）**：设置页三处选中态药丸（代码高亮风格 / 更新渠道 / 玻璃质感模式）标签实测对比度仅 **1.26:1**（Macchiato `#7181b1` on `#63719a`）——暗色蓝梯把该对两端都混在中灰蓝：`state-business-tertiary`(=deepseek-800) 混 base 52%、`state-business-primary`(=deepseek-400) 混 66%，官方暗色的 `#34415b`/`#679efe`(4.6:1) 动态范围被压扁。修复：`blueDarkPlan` 深端（800/900/950）改为朝最深表层 `crust` 混且压到 18%/14%/10%（`generate-palettes.mjs` 新增每步可选混色目标，未指定仍为 base），并按 issue #7 的既有机制把 `state-business-primary` 钉到纯 accent（`deepseek-500`）。改后标签对 tint 为 Frappé 4.60:1 / Macchiato 5.49:1 / Mocha 6.40:1（AA 通过），同 token 兼作填充的开关轨道、焦点环、活动页签也从 3.7:1 提到 6.5~8.9:1；宿主轨迹视图的 `user` 徽标用的是同一对，一并修复。新增 `tests/palettes.spec.ts` 的 `dark blue tint readability (issue #11)` 断言（旧表失败、新表通过）。（EN: repaint the dark blue tint at the deepest surface and pin the business label to the accent — fixes the ~1.26:1 selected-segment text in all three settings rows and the host trajectory badge）

> 待办（同批测量，未纳入本次修复）：`state-success-tertiary` / `state-warn-tertiary` 有同型配对（官方 `contextGreen` / `warn-label` 芯片），当前 3.5~3.8:1，同样可用 crust 目标收尾；Latte 的 business 对为 3.23:1（官方 3.74:1，属上游设计特性）。（2026-09-15 复核：已立为跟踪项 **VV** 并实测——green-500/green-900 = 3.67/4.37/5.02、amber-600/amber-900 = 3.18/3.79/4.34，改 `crust` 目标后预测 ≥5.4；见 `docs/plugin-improvements.md` 六、跟踪表。）

### 改进（设置弹窗玻璃化）

- **设置弹窗内的卡片/选择器统一为玻璃质感**：设置对话框的面板本身早已是玻璃（`--dsh-glass-card-raised` + blur），但面板**内部**的一切都用不透明的抬升表层 token 上色（`bg-module-platform` 用于选择器/步进器/卡片、`bg-layer-3` 用于插件卡片、`bg-layer-2` 用于展开的卡片、侧栏的 nav token 用于弹窗自己的导航），于是四五个设置页里的行读起来像贴在玻璃上的纯色 `#313244` 板子。现在在弹窗作用域内把这几个 token 重新指向「同一阶梯 + 半透明」：卡片保住自己的层级身份（仍比面板高一档），而遮罩的模糊从底下透上来——玻璃叠玻璃，且不需要任何按宿主类名的选择器，插件自带的设置卡片（终端 / Agent 循环 / Subagent / 网页搜索）自动继承。alpha 跟随磨砂旋钮（`--dsh-glass-frost`），深色读阶梯上端（bluish-800/850/750），Latte 读下端（bluish-60/00/100/75），两套实测均正确。新增 `data-dsh-glass-settings` seam（`glass-seams.ts`）与 `tests/glass-seams.spec.ts` 断言。实测（Mocha，frost 20）：面板 `#0c0c13`、卡片 `#20212d`（升一档可见）；Latte：面板 `#c5c6ca`、卡片 `#b6b7ba`。（EN: settings-dialog rows become glass on glass — the raised-surface tokens are re-pointed to translucent mixes of the same ladder step inside the dialog seam, dark and light ladders both）

### 回退

- **撤销 0.5.1-beta.1 的设置 UI 外观统一，恢复旧设计**：该版把三个设置行的分段控件、开关与 "?" 帮助徽标收敛到新的 `src/client/controls.tsx`，并调整了选中态写法、卡片刻度与 placeholder 取值。观感未通过，按要求整体回退——`src/client/controls.tsx` 与 `tests/controls.spec.ts` 删除，`CatppuccinRow` / `UpdateRow` / `glass-row` / `GlassRow.module.css` 恢复原实现（本版这些文件与 `0.5.1-beta.0` 逐字节一致）。issue #11 的深色可读性修复属调色板层，不受影响，仍然生效。（EN: revert the 0.5.1-beta.1 settings-UI unification back to the previous design — the shared controls module is gone and the rows are identical to beta.0; the issue #11 palette fix stays）

## [0.5.0] - 2026-09-07

### 修复（2026-09-07）

- **修复设置行崩溃（React #185，随改进批次引入）**：`overrides` 的 `useSyncExternalStore` getSnapshot 每次返回新对象导致无限重渲染，Catppuccin 设置行崩溃不渲染。新增 `overridesSnapshot()` 稳定引用快照（内容不变时返回同一对象），并加单测锁定。（EN: stable-reference overrides snapshot — fixes the settings-row crash）
- **修复刷新/重启后风味回退（issue #10）**：`theme/change` 监听器内的风味恢复改为微任务延迟执行——原实现同步调用 `theme.setTheme(flavor)` 会重入 `publish()`，导致展示层（ThemePresenter，注册晚于插件）最后应用外层分发携带的过期设置文档快照（dark/system），DOM 回退为官方深色而运行时 preference 仍是风味。延迟后风味的 `setTheme` 成为分发结束后的最后一条事件，展示层最终应用风味；执行时重查 `preference` / `liveBuiltinPick`，用户本会话显式选择的 light/dark 仍优先。新增 `tests/reentrancy.spec.ts` 回归测试（旧代码失败、修复后通过）。（EN: defer flavour restore out of the theme/change dispatch; fixes the stale-snapshot re-apply on refresh/restart）

### 非视觉改进批次（2026-09-06，按 docs/plugin-improvements.md 实施）

> 只实施无视觉判断的改进项；视觉项（预览图/skin 调优等）由视觉模型或人工复核收尾，见 `docs/plugin-improvements.md` 跟踪表。

- **持久化读侧一致性（C/X）**：`persistStateToScope` 写回前比对 snapshot revision——文档在防抖窗口内被外部推进且非本方回显时放弃本地写并重采纳远端状态；UpdateRow 显示「另一窗口已更新，本地改动未保存」横幅。写侧 fencing 仍由 `scope.mutate` 负责，未重复造乐观锁。（EN: read-side durability guard + conflict banner）
- **glass seam stamper 防抖（N）**：MutationObserver 回调按 `requestAnimationFrame` 合批，每帧最多一次 stamp、无变更帧零开销。（EN: rAF-batched seam stamping）
- **glass CSS 懒加载（II）**：`glass.module.css` 不再随 bundle 急切注入——构建脚本生成 `glass-css.gen.ts` 文本，`GlassLayer` 启用时才挂 `<style>`、关闭即移除。（EN: lazy-mounted glass stylesheet）
- **host half 拆分（A）**：update-check 路由迁出 `src/index.ts` 到 `src/update-check/host.ts`（index ≤120 行）。（EN: extracted update-check host module）
- **更新检查增强（H/I/U/V/W）**：`autoCheck` 开关（启动 + 每 6h 自动检查）；渠道 segmented（latest/beta，`selectNewest` 三态 + 按渠道分桶缓存）；错误码细分为 `network.local` / `network.upstream`；失败 30s 后自动重试一次；ETag 条件请求（304 复用缓存）。（EN: auto-check, channel pick, error-code split, one retry, ETag caching）
- **token 覆盖与懒注册（K/JJ/M）**：`overrides` KV 覆盖（CatppuccinRow 折叠编辑器，注册时合并）；主题改懒注册——只注册当前风味、选中时按需注册；`shikiStyle` 二维表（default / italic-comments）+ 选择器。（EN: token overrides, lazy theme registration, shiki style pick）
- **TUI 同步加固（R/S/T）**：owned 文件漂移默认 `.bak` 备份后再写（可选 overwrite/preserve）；`dryRun` 只报告 planned writes；`catppuccin-community/` 子目录 write-if-missing 同步。（EN: backup-on-conflict, dry-run, community themes）
- **契约与迁移（Y）**：`src/state.ts` 新增 `migrate(raw)` 版本迁移入口，`docs/state-migrations.md` 记录约定。（EN: state migration entry + doc）
- **e2e（EE）**：`tests/e2e/update-check.e2e.spec.ts` 用真 cordis + 真 HTTP 服务断言路由契约/渠道/缓存/304/502 与 settings 注册。（EN: real-cordis e2e for the update route）
- **palette 锁定（L）**：`generate-palettes.mjs --pin <sha>` 把上游 commit 写进 `palettes.ts` 头部 `// UPSTREAM_PIN`。（EN: upstream pin flag）
- **国际化与可访问性（CC/DD/J/AA）**：新增 ja/ko/es/fr/de 字典（key 集合同步由 `tests/locales.spec.ts` 锁定）；风味副标题；row 帮助徽标（上游无 tooltip API，原生 title 落地）；glass segmented roving tabindex + 方向键。（EN: 5 new locales, flavour subtitles, help affordance, segmented keyboard nav）
- **DX（GG/HH/KK）**：`CONTRIBUTING.md` 贡献指南；typedoc 生成 `docs/api/`（`pnpm docs:api`）；host 侧构建开 sourcemap 并发布 `*.map`。（EN: contributing guide, typedoc, sourcemaps）

### 持久化重构到官方 settings 机制

> **决策（2026-08-29）**：先发 0.4.3（兼容修复）。0.5.0 重构**非必需**——0.4.3 后插件在 0.1.1-rc.2 与 0.1.2-alpha.1 均正常，自建持久化稳定运行。重构是工程质量优化（少维护一套自建持久化），等 DSH 0.1.2 正式发布、官方 settings 机制稳定后再实施，届时 devDeps 同步对齐并移除 runtime 类型 bridge。
> **进展（2026-09-05）**：调研确认 DSH 0.1.2 尚在 rc 阶段（最新 `0.1.2-rc.1`，2026-09-03 发布，API 已冻结）；rc.1 实际 API 与下列计划有两处出入，已按实际 API 实施：① host 侧 0.1.2 系列**已无独立函数 `installSettingsSection`**（0.1.1-rc.2 还有），改为 provider 方法 `ctx.settings.installSection(owner, ns, schema, entry, hooks)`（optional wiring：settings 服务存在时注册、消失时回退 entry config）；② **`settings.plugin.item` 槽位不存在**——实测 0.1.1-rc.2 与 0.1.2-rc.1 的 slots 表完全一致（`settings.trigger/header/action/close/section/plugins.tab/onboarding/general.item`），原"迁到 plugin.item 卡片槽"可选项作废，设置行继续用 `settings.general.item`。另实测 `dsh-host-apiproxy` 0.1.1-rc.2（最新）的 `settings.describe` 已无 allowlist 过滤，"注册即暴露"成立；0.1.2-rc.1 的 `dsh-client-ui-settings` 不再从 `dsh-client-runtime` 导入类型（自含 `settings-contract.ts`），renderer 自带 `ctx.slots` merge，故 runtime 类型 bridge 已随 devDeps 对齐一并移除。

- **持久化迁移到官方 settings 机制**：删除自建的 `/catppuccin/state` GET/PUT 路由、`src/host-state.ts`、`src/state-sync.ts` 的 fetch 包装与 `$DSH_HOME/catppuccin-state.json` 的写入，改用官方文档持久化（同样跨 Desktop 重启）。
  - host 侧 `src/index.ts` 用 `ctx.inject(['settings'])` + `ctx.settings.installSection(ctx, 'catppuccin', schema, defaultSettingsSection, hooks)` 注册命名空间（optional wiring：无 settings 服务的 profile 静默跳过、保持 composition 纯值运行）；顶部的过时 allowlist 注释同步更新为"注册即暴露"事实。schema 定义在 `src/settings-catppuccin.ts`（schemastery，与 `src/state.ts` 共享 `CatppuccinSettingsSection` 契约）。
  - client 侧 `src/client/index.ts` 改用 `ctx.settingsScope.bind({ namespace: 'catppuccin' })`：scope 快照就绪且 `mode === 'host'` 时以文档为源 hydrate（回声写跳过、外部编辑文档胜出），`user` 层为空时把本会话 localStorage 选择推入文档；`snapshot status` 非 `ready`/mode 非 `host` 时降级 localStorage 兜底（仅影响跨重启持久）。
  - **老用户迁移**：`src/legacy-state.ts` 只读 `catppuccin-state.json`，启动时若文档尚无 user 层则一次性 `settings.update` 迁入；文件保留作回退，迁移失败非致命。
  - 玻璃质感层持久化同样改走 settings 文档（`glass-layer.ts` 的 `getRemoteState`/`applyRemote` 接口不变，`src/client/state-sync.ts` 改为 scope mutate 全量原子写 + debounce）。
  - **devDeps 对齐 `0.1.2-rc.1`**：cordis `^4.0.1 → ^4.0.2`，全部 `dsh-client-*` / `dsh-*` 类型包升 `0.1.2-rc.1`（含 dsh-brand/dsh-session/dsh-scope/dsh-invariants peer），新增 `@deepseek-ai/dsh-settings` + `@deepseek-ai/schemastery` 类型依赖，删除 `@deepseek-ai/dsh-client-runtime`（0.1.2 起移除，类型 bridge 不再需要）；`tsdown.config.ts` 的 lib external 修正为 `@deepseek-ai/schemastery`（原名写错导致被打进 host bundle，50.6kB→21.0kB）。
- **测试同步**：`tests/host-state.spec.ts` → `tests/legacy-state.spec.ts`（只读迁移源）；`tests/client.spec.ts` 的 fetch 包装测试 → `isScopeUsable` / `durableStateFromSnapshot` / `persistStateToScope`（mutate ops 全量原子写）/ debounce；`tests/state.spec.ts` 移除 `STATE_ROUTE_PATH` 断言、新增 settings section 辅助函数测试（共 91 个测试全绿）。

## [0.4.3] - 2026-08-29

### 修复

- **兼容 DSH 0.1.2-alpha.1（dsh-client-runtime 移除）**：0.1.2 起
  `@deepseek-ai/dsh-client-runtime` 包被整体移除（slots 职责并入
  `dsh-client-ui-renderer`，新版 web 组合不再提供该服务）。插件 client 半区
  的 `dsh.client.inject` 声明了已不存在的 runtime 服务，会导致 client 半区
  永久等待、主题与设置行不生效。现将 inject 目标改为
  `@deepseek-ai/dsh-client-ui-renderer`，`ClientContext` 类型改从
  `@deepseek-ai/cordis` 导入，并移除 tsdown 中对已废弃 runtime /client 的
  external 豁免（该豁免现会生成运行时无法解析的 require，改为由纯度门在
  构建期拦截）；devDeps 的 client 类型包从 `^0.1.0-rc.6` 升至
  `^0.1.1-rc.2`（npm 当前可用版本，0.1.2 发布后再对齐）。
  **注（临时类型 bridge）**：devDeps 中保留
  `@deepseek-ai/dsh-client-runtime@^0.1.1-rc.2` 仅用于类型编译——0.1.1-rc.2
  的 `dsh-client-ui-settings` / `ctx.slots` Context merge 仍由该包类型提供
  （`dsh-client-ui-renderer` 自带 `ctx.slots` merge 是从 0.1.2 才开始的）。
  运行时不注入该服务，0.1.2 发布、devDeps 对齐后即可移除。
- 其余 API 经验证兼容：ThemeRuntime（register/setTheme/getTheme/theme/change）、
  `--dsw-*`/`--dsw-alias-*`/`--shiki-*` token（名称与值零差异）、webServer
  路由注册、slots/locale 注册、`settings.general.item` 槽位、React 18、
  `dsh plugin --profile` CLI、cordis 4.0.1 均未变化。

## [0.4.2] - 2026-08-29

### 修复

- **玻璃态下侧边栏 fixed 弹层被裁切的通用修复**：`sidebarCol` 上的
  `backdrop-filter` 会把 `position: fixed` 后代（任意插件从 `sidebar.*`
  slot 弹出的菜单 / dialog / 看板，例如 dsh-cost-dashboard 的
  `.cd-footerPanel`/`.cd-footerMask` 纯 div 弹层）的 containing block 从
  视口改签到侧边栏列，再被列上 `overflow: hidden` 裁成窄条，遮罩也只盖
  侧边栏。原有 `:has([role='dialog'])` 守卫只认 `role='dialog'`，对这种
  无角色的弹层完全漏防。
- **实现**：把磨砂填充 + `backdrop-filter` 模糊 + 顶缘高光从列元素移到
  `[class*='sidebarCol']::before` 子层（`z-index: -1; pointer-events: none`）。
  伪元素不是内容后代的祖先，其背景模糊只作用于页面背景，对任何
  fixed 后代**不再构成 containing block**——结构性根治，无需逐插件
  写选择器，所有从侧边栏 slot 弹 fixed 层的插件一次性恢复视口锚定。
  删除已失效的 `:has([role='dialog'])` 守卫。视觉（玻璃片填充/描边/
  圆角/阴影/折叠 rail）保持不变，关闭玻璃态完全还原原生界面。

## [0.4.1] - 2026-08-28

### 修复

- 深色 flavor（Frappé / Macchiato / Mocha）下弱层级文字（
  `label-secondary` / `label-tertiary` / `caption` / `dimmed`）对比度过低，
  改指更亮的调色档位，采纳 PR #8 的 `label-primary-dimmed` 层级改进
  （bluish-100 → bluish-75, subtext1）。(closes #7)
- 设置页文档显式指定 light/dark 时，刷新 / 重启后主题丢失（issue #6）。

## [0.4.0] - 2026-08-25

### 新增

- **dsh-TUI 终端主题支持**：一条命令装进 dsh-tui profile，启动时自动把
  四套 Catppuccin 主题同步到 `~/.dsh-tui/themes/`，`/theme` 切换；Web 端
  启动时若目录已存在也会自动同步。
- 新增 dsh-TUI 四风味主题静态资产（`themes/`）。

## [0.3.1] - 2026-08-23

### 变更

- 移除设置页的自动检查更新，回到纯手动按钮，避免未经用户动作的网络请求。

## [0.3.0] - 2026-08-23

### 新增

- 玻璃质感新增**清透 / 标准 / 磨砂**三档一键预设（滑条保留微调）。
- 设置行挂载时自动静默检查一次插件更新；Host 侧检查结果缓存 5 分钟。
- 关闭 Catppuccin 风味时**还原用户原有的官方主题偏好**，不再强制重置为
  「跟随系统」。

### 其他

- 玻璃旋钮默认值单一来源化（从 `DEFAULT_GLASS` 派生）。

## [0.2.11] - 2026-08-23

### 修复

- 收窄 `[class*='bubble']` 玻璃选择器到会话容器内，避免误伤第三方
  widget（如 dsh-whale-widget 的 `.dshwv-bubble`）。

## [0.2.10] - 2026-08-23

### 修复

- Latte 下「预览版」徽章文字对比度过低。(closes #4)

## [0.2.9] - 2026-08-22

### 修复

- 切换模型后 Catppuccin 主题被重置的问题。(closes #3)

## [0.2.8] - 2026-08-21

### 修复

- 顶栏圆角处玻璃轮廓线断开。(closes #2)

### 新增

- 语法高亮对齐 Catppuccin 官方配色（amber-400 改回 peach 系）。

## [0.2.7] - 2026-08-18

### 修复

- **DSH Desktop 持久化**：主题 / 玻璃偏好持久化到 DSH home 文件，
  桌面端随机端口重启不再回退默认配色。
- 更新检查适配 DSH Desktop，升级命令随环境自动变化。

### 新增

- 模型选择弹层分组名改为贴合文字的胶囊标签（参考新会话按钮），弹层背景
  提浓至主题 layer-2 @70%，提升可读性（原约 9% 近透明）。

## [0.2.5] - 2026-08-17

### 新增

- **玻璃质感皮肤**（云母 / 兼容双模式，模糊度 / 磨砂度 / 背景亮度可调），
  配色自动跟随当前 Catppuccin 主题。
- **检查 Catppuccin 插件更新**设置行：查询 npm dist-tags，通道感知
  （latest/beta）semver 比较并给出可复制升级命令。
- 页面边缘渐变模糊、气泡与新会话按钮玻璃化、折叠栏悬浮玻璃等玻璃细节。

### 修复

- 统计行宽度恢复为受容器约束，修复玻璃模式下溢出检测失效导致悬浮全文
  tooltip 不出现的问题。

## [0.2.0] - 2026-08-16

### 新增

- Catppuccin 四个风味主题（Latte / Frappé / Macchiato / Mocha）接入官方
  主题系统，全界面配色覆盖。
- 四主题斜切合成预览图。

## [0.1.x] - 2026-08-15/16

### 修复

- 0.1.2：将 `schemastery` 移入 dependencies（runtime 使用，
  devDependencies 在安装时不生效）。
- 0.1.1：补充 repository / homepage / keywords 字段。

[Unreleased]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.4.3...v0.5.0
[0.4.2]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.11...v0.3.0
[0.2.11]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.10...v0.2.11
[0.2.10]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.5...v0.2.7
[0.2.5]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.0...v0.2.5
[0.2.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.1.2...v0.2.0