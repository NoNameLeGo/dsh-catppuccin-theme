# Changelog

本项目的所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（`0.x.y` 正式版，
`0.x.y-beta.n` 预发布 → `beta` npm 标签）。

## [Unreleased]

> 本节（2026-09-24 下半场）随 **`0.5.7-beta.0`** 发到 npm 的 `beta` 渠道（`latest` 仍是 `0.5.6`）：
> 官方桌面壳识别改用 Electron 运行时，外加一批文档 / 仓库卫生修正（提交 `bbba077`、`4b3fa59`）。

### 修复

- **官方桌面版现在能被正确识别（`process.versions.electron`）**：上一节把识别信号改成了「官方壳注入的
  `DSH_DESKTOP_NODE_EXECUTABLE`」，但 2026-09-24 取证发现官方壳**根本不注入它**（上游说明：
  「**`DSH_DESKTOP_NODE_EXECUTABLE` 仅为包安装注入**」），于是官方桌面版会退化成纯 web 文案。
  现在 `isDesktopShellEnv()` 认**两路信号**：社区壳的环境标记，或 Electron-as-node 运行时
  （`process.versions.electron`，实测 Electron 37.10.3 有值、纯 node 为 `undefined`）——
  官方壳的 Host 正是 Electron 以 node 模式 spawn 的。`tests/profile-detect.spec.ts` 新增 5 条断言，
  `tests/e2e/update-check.e2e.spec.ts` 新增一条走 Electron 分支的真路由用例，**两条路径都做了变异验证**
  （拆掉 Electron 分支分别变红；e2e 那条起初推进 30 分钟会命中上一条写入的未来时间戳缓存而**假绿**，
  改成 60 分钟后才真正验证到）。**只影响提示文案与 profile 探测的 `env` 字段**，持久化与 profile 名不受影响。
  （EN: the official desktop shell does not expose the env marker either, so it is now recognized through
  the Electron-as-node runtime; both branches are mutation-verified, and the e2e case needed a longer clock
  advance to stop passing off the previous case's cached verdict）

### 其他

- **更正「官方桌面壳靠 `DSH_DESKTOP_NODE_EXECUTABLE` 识别」这条假设（2026-09-24 取证）**：上游架构说明的原话是
  「`DSH_DESKTOP_NODE_EXECUTABLE` **仅为包安装注入**」（`.agents/notes/implemented/architecture/2026-09-11-desktop-electron-node-runtime.zh.md`），
  代码印证：`apps/desktop/src/host-process.ts` 以 `desktopNodeEnvironment(this.node, undefined, …)` 起 host，
  `bin === undefined` 时**不设**该变量；`apps/desktop-host/src/index.ts` 只在 `runProfile({ packageManager: { env } })` 里给它。
  ⇒ 官方 Electron 桌面版（`apps/desktop` + `apps/desktop-host`，`private: true`、**未发 npm**）的 **profile 进程里没有它**，
  `isDesktopShellEnv()` 在官方壳下恒为 false、更新行会退化成纯 web 文案。**profile 名与设置读写不受影响**
  （前者靠扫 `profiles/` 目录命中 `desktop`，后者走 0.1.7 的 `configForms` seam，与壳无关）。
  已实测的替代信号：Electron 以 node 模式运行时 `process.versions.electron` 有值（本机实测 `37.10.3`），纯 node 下为 `undefined`。
  本轮**只改注释与文档**（`src/profile-detect.ts`、`AGENTS.md`、`README.md` / `README.en.md`），运行行为未动。
  （EN: the official desktop shell does not mark its profile process at all — upstream injects
  `DSH_DESKTOP_NODE_EXECUTABLE` into package-install children only — so the desktop probe is a no-op there;
  comments and docs now say so, behaviour unchanged）

## [0.5.6] - 2026-09-24

> 本节节内各批都先在 npm 的 `beta` 渠道发过一轮（`0.5.6-beta.0` → `beta.2`），本版本起整节进 `latest`。
>
> 第一批来自 2026-09-22 的全量代码审计（`docs/code-audit-2026-09-22.md`）：9 条缺陷 F1~F9 同日修完，
> 新增 15 条断言（173 用例全绿），其中 F1/F2/F3/F5/F6 逐条用变异测试验证过「改回旧写法即变红」。

> **2026-09-23 追加：上游 0.1.7 适配复核（含跨版本兼容）。** 按 `AGENTS.md`「上游形态与维护核心」核对，官方 token 表自
> 0.1.6 / 0.1.7 起**新增 9 个 token**（static 73→77、alias 79→84，取值变更只有 2 处），其中两个会直接把配色改坏（带 alpha
> 的静态色被抹成实心、菜单底色退成官方灰），另有一处 DOM 钩子自 0.1.5-rc.2 起就指错了元素。核对用的上游快照为
> `dsh-v0.1.7-alpha.2`（master，2026-09-22），并逐项对 **0.1.5-rc.2 / rc.3 / 0.1.6-alpha.1 / 0.1.7-alpha.2** 四个 tag 复核
> （`register()` 契约、DOM 钩子、token 差异）。生成物重出，**新增 15 条断言（5 条经变异验证会红），191 用例全绿**。
> **未做真机复核**——本机 profile 的依赖树不完整（`@deepseek-ai/dsh-sandbox-local` 解析失败），起不来服务。
> 本批（连同 `0.5.6-beta.0` 之后的官方桌面壳识别、CI 树冻结）随 **`0.5.6-beta.1`** 发到 npm 的 `beta` 渠道；
> `latest` 仍是 `0.5.5`。

> **2026-09-24 追加：DSH 0.1.7 换掉 settings seam 的适配（issue #15）。** 上游 `0.1.7-alpha.1` 删掉了客户端的
> `settingsScope` 服务与 Host 的 `settings.installSection`，改成「插件声明带 `.volatile()` 的 `Config`，设置服务按
> **profile 条目 id** 投影成表单，客户端用 `ctx.configForms.get(id)` 读写」。本插件把旧服务写进了**硬依赖 `inject`**，
> 于是 0.1.7 上整条插件永久 `pending`（主题、四条设置行、更新检查全不加载）；Host 侧的 `installSection` 调用同时失效。
> 因为 `latest`（`0.1.5-rc.3`）仍是旧 seam 且在售，本次改为**双通道**：两个服务各走一次**可选注入**，谁在就用谁，
> 三处语义差异（「还没有用户层」的判据、写栅栏、拒绝信号）全部收敛在通道内部，调用方看不到；`settings.general.item`
> 槽位与全部 UI 不动。跨版本的关键守卫是 `.volatile()` 的 `typeof` 检测——该方法是 schemastery **3.18.3** 才有的，
> 而 0.1.5/0.1.6 宿主锁 `3.18.2`，无条件调用会在**模块求值期**抛错（把「不激活」升级成「加载失败」）。
> **新增 23 条断言（215 用例全绿）**；8 条跨版本判定（含软注入永不出现、3.18.2 下守卫成立、旧宿主不会多出表单）
> 用一次性探针实测过，0.1.7 侧的表单投影用 0.1.7-rc.1 的 `volatileForm`/`isVolatilePath` 原逻辑对跑验证。
> **当时未做真机复核**（本机 CLI 是 `0.1.5-rc.2`、`web` profile 依赖树不完整）——**已于同日补做并通过**，见本节下方。
> 详见 `docs/issue-15-settings-seam-0.1.7.md`。
> 本批经 `0.5.6-beta.2` 在 `beta` 渠道试跑后，随本版本进入 `latest`。
>
> **2026-09-24（beta.2 之后）：修正客户端平台模块表的镜像。** `web-platform.ts` 是上游 `packages/client/web/src/platform.ts`
> 的**镜像**，此前多写了两个**已退役**的 specifier（`dsh-client-web-react`、`dsh-client-schema-form`，两者都停在 `0.1.0-rc.7`，
> 在任何版本的上游表里都不存在）、漏了两个**现役**的（`dsh-client-store`、`dsh-client-ui-dockkit`）。逐 tag 核对
> `v0.1.2-rc.1 / v0.1.5-rc.3 / v0.1.6-alpha.2 / v0.1.7-alpha.1 / v0.1.7-rc.1 / master`：修好后的表在我们支持的全部版本上一致
> （只有 `v0.1.2-rc.1` 早于 dockkit）。**此前不致命**——客户端只从这张表取一个值导入（`react` / `react/jsx-runtime`）——
> 但表错着，一旦以后要从 `dsh-client-store` / `dsh-client-ui-dockkit` 取值就会被 bundle 纯度门拒掉，
> 而引用那两个退役名字会产出一个真实表答不上来的 `require()`。新增 5 条断言把表钉住（含「产物只 require 表内 specifier」
> 与「tsdown 仍从表派生 externals」），两条经变异验证会红。
>
> 同日 **真机验证了 beta.2 在 DSH `0.1.7-rc.1` 上确实修好**（维护者把 DSH Desktop 升到 0.1.7 后，用该运行时启动 `web` profile）：
> 装 beta.1 时页面一字不差地复现 `pending (waiting for service: settingsScope)`；换 beta.2 后无 pending、四条设置行齐全、
> 点 Mocha 后 profile patch 的 `flavor` 落成 `catppuccin-mocha`、重启后用全新浏览器会话仍从文档 hydrate 回 Mocha。
> **真机还抓出一个单测与假宿主都没暴露的缺陷**：`scheduleLegacyMigration` 的三次机会之间只挡了「已完成」标志，
> 于是首次启动跑了两个并发迁移——先写的成功，后写的在它提交前读到同一个 revision、撞栅栏被拒，日志里出现
> `legacy state migration failed: SettingsConflictError`（迁移其实成功了，观感像出错）。改为入口**同步认领**槽位
> （仅在 outcome 为「暂不可寻址」时释放），并加 `tests/migrate-legacy.spec.ts` 并发用例（用跨 tick 的写延迟复现；
> 去掉守卫即变红）。详见 `docs/issue-15-settings-seam-0.1.7.md` §0.1。
>
> 同日顺带更正一处沿用了三个版本的错误叙述：注释与 README 一直写着「DSH Desktop 每次启动用随机回环端口 ⇒
> localStorage 本来就空」，实测**两个桌面壳都早已是固定端口**（官方壳 `apps/desktop-host` 传 `--port 19387`；
> `anywhere-labs/dsh-desktop` 默认 `43120`，仅绑定冲突时顺序 +1，且 2026-08-21 就提交了 "prefer a stable loopback
> port"）。持久存储的设计理由因此改写为「localStorage 是 per-browser / per-origin，DSH home 才是机器级真源」——
> **代码与行为一字未改**，只改叙述。另记一处已知缺口：0.1.7 会一次性把 `settings.yaml` 按同名条目导入后改名
> `.imported`，我们旧的 `catppuccin:` 段匹配不到条目、被拒；捞回它要读 YAML 而 host 半区是零依赖产物，本次未做，
> 影响面仅限于「偏好只在旧持久存储里、当前浏览器 localStorage 里没有」这一种情形（固定端口的 origin 是稳定的，
> 正常升级会把 localStorage 的选择推回新文档）。

### 修复

- **DSH 0.1.7 上插件不再永久 pending（issue #15）**：客户端 `inject` 从 `['slots','locale','theme','settingsScope']` 改为
  `['slots','locale','theme']`，两套设置服务（`configForms` / `settingsScope`）各走一次可选注入，由 `src/client/state-sync.ts`
  的 `DurableScope` 适配层绑定「宿主要在的那一个」。副作用是**注入时机提前**（不再等设置服务）：本地缓存先渲染、设置服务
  到达时再补一次 hydration，这正是原有的 boot 语义。3 条断言钉住「任一 seam 都不在硬依赖里」「两条软注入都在」
  「服务晚于 apply 出现时仍能补水」。（EN: the client no longer hard-depends on either settings service — the plugin used to
  wait forever on `settingsScope`, which 0.1.7-alpha.1 removed; both seams are now bound optionally behind one adapter）

- **Host 半区同时支持两套设置服务**：新增 `Config`（volatile 字段表，由 `cordis.patch.yml` 条目 id 寻址）供 0.1.7 投影表单；
  `installSection` 分支保留并加 `typeof` 守卫，旧宿主行为逐字节不变（注册、`catppuccin` 命名空间、落点、迁移栅栏策略都未动）。
  一次性迁移搬到 `src/migrate-legacy.ts`：新通道下**必须延迟 + 重试**——`ctx.inject(['settings'])` 在服务已就绪时会同步回调，
  那一刻本条目的 fiber 还没 ACTIVE，`describe()` 看不到自己，迁移会被静默跳过。表单默认值与 `defaultSettingsSection()`
  逐字段一致（客户端把「等于默认」当作「尚无用户选择」），并有断言防止漂移。（EN: one field table feeds both schemas; the
  migration is deferred on the new seam because the entry is not addressable until its own fiber is ACTIVE）

- **`.volatile()` 做了能力检测（跨版本兼容）**：`.volatile()` 仅存在于 schemastery 3.18.3+，而 0.1.5/0.1.6 宿主锁 3.18.2，
  且本插件的 lib 产物把 `@deepseek-ai/schemastery` 保持外置（用宿主那一份）——无条件调用会在模块求值期抛
  `TypeError: ...volatile is not a function`，把「插件不激活」升级成「插件加载失败」。`maybeVolatile()` 在无该能力时返回原节点，
  于是旧宿主上条目不含 volatile 元信息、不产生任何表单（等价于 0.1.7 之前的现状），新宿主上才是可编辑表单。
  3 条断言覆盖守卫的两个分支、Config 每个叶子都带 volatile、以及旧 schema 一个都不带。（EN: `.volatile()` is
  feature-detected because the old hosts load this module with schemastery 3.18.2, where the method does not exist — calling it
  unconditionally would turn "plugin pending" into "plugin failed to load"）

- **`.volatile()` 加上「两个 schema 不复用节点」的约束**：`.volatile()` 是原地改 `meta` 并返回 this，旧命名空间 schema 与新
  volatile `Config` 因此各自从字段工厂取一套全新节点。（EN: the two schemas never share node instances, since `.volatile()`
  mutates the node in place）

- **菜单底色的半透明只在「宿主真会模糊它」时启用（跨版本兼容）**：`--dsw-specific-menu` 从 `var(--dsw-alias-bg-layer-3)` 变成
  58%/50% 半透明，是**和** `--dsw-menu-backdrop-filter: blur(40px) saturate(150%)` 同一次改动引入的（0.1.7-alpha.1；0.1.6-alpha.1
  仍是不透明阶梯步、也没有该 blur token）。`latest` 线（0.1.5-rc.2 / rc.3）上没有那个 blur，同一份 58% 填充就只是**纯透明**——
  聊天内容会直接透过菜单，而该 token 还画着带文字的面板（队列 dock、待办、目标条、任务列表、统计弹窗…）。因此注册主题时
  探测宿主是否声明了该 blur（读 `<body>` 计算样式；先用 `--dsw-mask-blur` 做机制自检，读不到就保守按「无 blur」处理），
  据此决定注入半透明填充还是不透明的 `bg-layer-3`；该补丁位于用户覆盖项**之下**，显式 override 仍然最高优先。5 条断言覆盖
  四种宿主形态（有/无 blur、样式表未入级联、无 body、无计算样式），并已用变异验证（永远返回 `{}` 即红）。（EN: the translucent
  menu fill only stands where the host actually blurs it — upstream introduced the fill and `--dsw-menu-backdrop-filter` in the
  same 0.1.7-alpha.1 release, so on the 0.1.5 latest line the same value would be plain transparency over the transcript; the
  theme registration now probes the host and falls back to the opaque ladder step, below user overrides）

- **官方 0.1.7 新增的带 alpha 静态色不再被抹成实心**：`--dsw-static-green-500-a08` / `-a12` 与 `--dsw-static-red-400-a12` / `--dsw-static-red-600-a08` 是「这一步 8%/12% 透明度」，不是阶梯步号——旧生成器把它们当未知步号落进家族默认档（100%），于是 `--dsw-alias-code-diff-added` / `-deleted` 这对 diff 底纹会渲染成不透明色块。新增 `splitAlpha()`（剥离后缀）与 `withAlpha()`（还原上游 alpha），并用 `flattenMix()` 把 `red-400` 这类先混色再上 alpha 的值算成单个 hex，产物保持 `color-mix(in srgb, #hex N%, transparent)` 一种形式。配套 5 条断言：4 个 token × 4 风味的 alpha 数值、fill 必须解析到 hex、以及两个 diff 别名的引用关系；已用变异验证（`withAlpha` 退回直返原值即红）。（EN: the alpha-suffixed statics added in 0.1.7 are "this step at N%", not ladder steps — the old table fell through to the family default and painted both code-diff surfaces fully opaque; the suffix is now split off and re-applied, and pre-mixed fills are flattened so the value stays a single `color-mix`）

- **菜单与浮层底色重新跟住 Catppuccin**：官方 0.1.7 把 `--dsw-specific-menu` 从 `var(--dsw-alias-bg-layer-3)` 改成字面半透明灰（浅 `rgba(248,249,250,.58)` / 深 `rgba(48,49,54,.5)`，配新 token `--dsw-menu-backdrop-filter: blur(40px) saturate(150%)`，macOS 走 94%）。生成器对 specific 层是「原样保留」⇒ 10 余个消费方（MenuView、PopupSelectView、QueueDock、ContextMeter、TodoPanel、GoalBar、JobListAction、ModelSelect、dockkit…）会一起退成官方灰。改为**保留上游的 alpha、把色相放回 `bg-layer-3`**。实测顺带发现收益：暗色三风味的菜单叠在更深的页面底色上，弱标签对比度反而**上升**（Frappé 的 tertiary 3.48→4.41、caption 2.80→3.54、dimmed 2.20→2.79），Latte 因页面与菜单同色而不变；三处依赖「菜单色」的既有断言随之改为按半透明合成后再算对比度（新增 `resolveSurface()` / `over()`）。（EN: upstream stopped deriving `--dsw-specific-menu` from the ladder and hard-codes a translucent neutral for its own backdrop-filter; keeping the literal would drop the flavour from every menu and popover, so the token keeps upstream's alpha but is re-pointed at `bg-layer-3` — and the translucent menu actually lifts dark weak-label contrast, so the menu-based assertions now composite before measuring）

- **新增的 `--dsw-alias-link` 在暗色下达到 AA**：官方暗色 `link` 用亮蓝 deepseek-400 `rgb(122,170,255)`（对页面 7.83:1），而我们的暗色蓝梯 400 步是 66% 混向页面，实测只有 3.94（Frappé）/ 4.38（Macchiato）/ 4.79（Mocha）——正文链接低于 AA。改为指向满档 accent（与 issue #11 的 `state-business-primary` 同款做法：不换色相、只换档位），实测 6.51 / 7.77 / 8.91:1。Latte 保持官方 500 步不动：我们 4.34:1 本就高于官方自己的 4.23:1，没有可偏离的证据。（EN: `--dsw-alias-link` is new in 0.1.7 and upstream's dark value is a bright blue (7.83:1); our dark blue ladder's 400 step is a 66% mix that leaves link text under AA, so the token now reads the full accent step — Latte keeps the official step because ours already beats upstream's own ratio）

- **文档 / PDF 预览的浅色标签不再糊在深底上**：0.1.7 新增的 `bg-document-preview`（浅→bluish-750、深→bluish-950）与 `label-document-preview`（浅→bluish-200、深→bluish-300）是「深底 + 浅字」组合，官方浅色自己实测 9.27:1；Latte 的阶梯按浅端读底，bluish-200 落在 overlay0，这对只剩 3.07:1。新增 Latte 专属 override 指向阶梯最浅步（`bluish-00`），实测 7.06:1，并把「暗色标签表」重构成「按方案分表」（新增 `lightLabelReadabilityOverrides`）。暗色维持 4.45~5.07:1 不动（已贴近 AA）。（EN: upstream's document-preview pair is a dark surface with a light label (9.27:1 on its own pair); Latte reads the ladder light-end-first, which collapsed it to 3.07:1, so the light label now points at the ladder's lightest step）

- **右侧栏的玻璃钩子改指面板本体（统计行经复核：原本是对的）**：详情栏接缝原写 `[class*="detailsCol"] [class*="root"]`，但该列在 **0.1.5-rc.2 已改名 `rightbarCol`**（`ui-layout/AppFrame.module.css`）；而右侧栏**面板自己**（`.session` / `.panel`）没有 `root` 类——带 `root` 的是它托管的内容视图（ui-sidebar-files / browser / terminal），文档预览视图连 `root` 都没有。⇒ 这个接缝此前命中的是**当时打开的那个内容视图**，或干脆什么也不命中，而不是样式表真正想透明化的那个面板。改为命中稳定属性 `data-sidebar-right-panel`（`SidebarRight.tsx`），旧写法保留作 0.1.2-rc.1 布局的兜底。统计行的接缝经复核**本来是正确的**（`StatsPills` 的根正是 `<div class="…root…" data-composer-stats>`，0.1.5-rc.2 与 0.1.7 一致），顺手补一个按位置的 `> *` 兜底——今天它与类名分支指向同一个元素、stamp 幂等，只是免得上游某天改掉那个类名就静默失效。新增 4 条 jsdom 断言（新属性命中 / 旧列兜底 / 真实 root 形态 / 无 root 形态），其中 2 条已用变异验证（改回旧选择器即红）。**注**：无真机复核，且右侧栏透明化的对象从「内容视图」变成了「面板本身」，观感必然有变化，需要视觉确认。（EN: the right-panel seam keyed off `detailsCol`, renamed to `rightbarCol` back in 0.1.5-rc.2, and off a `root` class the *panel* never had — the `root`-classed elements are the tab views it hosts, so the stamp used to land on whichever view was open (or nowhere, for the document preview); it now hooks the panel's own `data-sidebar-right-panel`. The stats seam turned out to be correct already — StatsPills' root is a `root`-classed div in both hosts — so it only gained a position-based `> *` fallback. Visuals still need a real-machine check）

> 以下条目来自 2026-09-22 的全量代码审计（F1~F9）批次，已随 `0.5.6-beta.0` 发布。

- **官方桌面版（Electron）也能被识别成 desktop（2026-09-22）**：官方上游 monorepo 已经带上 `apps/desktop` / `apps/desktop-host`（Electron 壳，启动 `$DSH_HOME/profiles/desktop`），但它**不提供**社区桌面包那个 `desktopProfiles` 服务（在官方仓搜该名字命中 0），只注入环境变量 `DSH_DESKTOP_NODE_EXECUTABLE`；而 `src/update-check/host.ts` 原先只探测服务 ⇒ 在官方桌面版里更新行会退化成纯 web 文案（升级命令提示与重启提示都按命令行给，尽管探测到的 profile 名已经是 `desktop`）。新增 `isDesktopShellEnv()` 作为第二路信号，`tests/profile-detect.spec.ts` 与 `tests/e2e/update-check.e2e.spec.ts` 各有断言（后者已用变异测试验证：去掉该分支即红）。维护核心同时明确为**官方 web + desktop**，社区桌面壳保持兼容（见 `AGENTS.md`「上游形态与维护核心」）。（EN: the official Electron desktop shell is now recognized too — it boots the same `desktop` profile but marks itself only through the `DSH_DESKTOP_NODE_EXECUTABLE` env var, since the official repo has no `desktopProfiles` service, so the update row used to fall back to plain-web copy there）

- **跨窗口改玻璃旋钮终于会同步（审计 F1）**：`glass-layer.ts` 的跨标签 `storage` 处理器用 `event.key in NUMERIC_KEYS` 判数字旋钮，而 `in` 查的是对象的**属性名**（`blur`/`frost`/`brightness`），事件带来的却是 localStorage 键（`dsh.catppuccin.glass.blur`）——该分支**恒为 false**：A 窗口拖模糊/磨砂/亮度滑块时，B 窗口既不重绘玻璃也不刷新设置行快照（模式键用的是 `===` 比较，一直正常，恰好掩盖了这个洞）。改用 `Object.values(NUMERIC_KEYS).includes(...)`；新增 `tests/glass-layer.spec.ts`，把 `storage` 处理器的每个分支（三个旋钮、模式、开关、`key: null` 全量重载、无关键）各走一遍。（EN: cross-tab glass-knob sync was dead — the handler matched the knob object's property names instead of the localStorage keys the event carries, so blur/frost/brightness changed in one window never reached the other)

- **多窗口的陈旧写不再静默覆盖，冲突横幅也能真的出现了（审计 F2，台账 `C`/`X`）**：读侧陈旧写保护此前**恒不成立**——`client/index.ts` 是在 **flush 时**才取 `baseRevision`，而 `persistStateToScope` 内部又 `getSnapshot()` 一次，两次读取落在同一个同步块 ⇒ 版本永远相等，`'stale'` 成了死代码（后果：另一窗口在防抖窗口内提交的新选择会被本窗口的旧状态覆盖，而 `emitConflict()` 只挂在 `'stale'` 上，所以「另一窗口已更新」横幅从未真正出现过）。现在新增 `createBaseRevisionTracker()`——**调度时**捕获（`??=` 只固 burst 首版）、flush 时消费，8 处调度点收拢为一个 `queuePersist()`。`tests/client.spec.ts` 用「防抖窗口内被外部改动」的时序用例锁住，并附反事实断言（flush 时取 base 会写成 `'written'`）。（EN: the read-side staleness guard was a tautology — the base revision was sampled at flush time instead of schedule time, so an external edit inside the debounce window was silently overwritten and the conflict banner could never fire)

- **另一窗口「关闭风味」现在真的会落地（审计 F4）**：`storage` 处理器只在目标不是 `off` 时切主题，而 `applyDesired` 读到 `off` 又直接 return ⇒ 另一个窗口关掉风味后，本窗口继续渲染 Catppuccin（要刷新才一致）。新增 `readExplicitFlavorOff()` 区分「从未存过」（Desktop 每次启动都是空 localStorage，此时权威是设置文档，不能当成 off）与「显式 off」，两条路径都经 issue #10 的微任务延迟回退到用户原来的内建偏好。（EN: an "off" chosen in another window now lands here too — the explicit-off check keeps Desktop's empty storage from fighting the settings document at boot）

- **预设档位重新可用键盘到达（审计 F3）**：旋钮被手调成非预设组合时 `activePreset` 是空串，roving tabindex 于是把三格全设成 `-1`——整个预设组掉出 Tab 顺序，键盘用户无法应用预设。现在无匹配时锚定第一格，组内恒有 1 个 tab stop；两条断言覆盖「命中预设」与「自定义档位」。（EN: the preset group lost its tab stop whenever the knobs matched no preset — the roving tabindex anchored on an empty value, leaving every cell at -1)

- **自动重试用的是当前通道（审计 F6）**：`UpdateRow` 的 `check` 默认取渲染闭包里的通道，失败后 30 s 的单次重试因此会查用户已经离开的那个通道；改为调用期解析。（EN: the single 30s auto-retry queried the render-time channel instead of the one the user had since picked）

- **覆盖编辑器删掉中间一行草稿不再串行（审计 F5）**：草稿行用数组下标当 React key，而键/值输入框是非受控的——删除首行后 React 复用其 DOM 节点，输入框继续显示被删那行的文本（与状态不一致）。改为稳定 `id` 作 key。（EN: draft override rows keyed by array index made an uncontrolled input keep the deleted row's text after a delete）

- **文档里的非法 override 键会被清掉，而不是每轮白跑一次（审计 F7）**：`overrides` 的 schema 只校验「字符串字典」，手改文档可能留下非 `--` 的键；客户端读时丢弃却从不写回，于是每次设置发布都会因为这份永远清不掉的差异再跑一轮「文档胜出」。新增 `hasUnpersistableOverrides()`，采用后回写一次使文档收敛。（EN: unpersistable override entries in the document are now cleaned instead of re-triggering the "document wins" adoption on every publish）

### 其他

- **重建仓库外快照，并把解析脚本入库（2026-09-23）**：本轮发现 `.cache/dsh-ref/`（`dsw-tokens.json` / `catppuccin-palette.json`）已被清掉，生成器因此跑不起来；同时官方 Catppuccin 色板**已不在 `catppuccin/catppuccin` 仓库根**（`palette.json` 随 2.0 的仓库改造消失，旧地址返回 404）。新增 `scripts/parse-dsh-tokens.cjs`（把 `design-platform.css` 解析成 `light_static` / `dark_alias` / … 六段快照）并写入仓库，生成器头部补上两条刷新命令与新色板来源（`@catppuccin/palette@1.8.0` 的 `esm/palette.js`，与 v1.8.0 同源同数据）。顺带确认仓库快照此前还落后于 `0.1.5-rc.2`（缺 `--dsw-alias-link`、`markdown-inline-code` 的取值停在旧版），本轮已对齐到 `0.1.7-alpha.2`。（EN: the out-of-repo token/palette snapshots had been wiped — and the official palette no longer lives at catppuccin/catppuccin's repo root (404) — so the parser is now vendored as scripts/parse-dsh-tokens.cjs and the refresh commands are documented in the generator header; the snapshot was also still behind 0.1.5-rc.2 and is now aligned to 0.1.7-alpha.2）

- 删除仓库根残留的临时副本 `.client-043.tmp.ts`（被 `.gitignore` 覆盖，但会污染文本搜索与 `grep` 结果）。（EN: drop the leftover `.client-043.tmp.ts` scratch copy）
- `scripts/gen-glass-css.mjs` 在缺 `lightningcss` 时的降级路径从静默改为 `console.warn`：该分支会产出**未压缩**的另一种产物。（EN: warn instead of silently shipping the unminified stylesheet when lightningcss is missing）

## [0.5.5] - 2026-09-21

### 修复

- **更新检查的「检查时间」改用 DSH 的语言格式化，不再跟浏览器走**：`UpdateRow.tsx` 里是 `new Date(x).toLocaleString()`——**不带参数 = JS 运行时默认 locale = 浏览器语言**，而界面语言是 DSH 自己的 locale 偏好，两者从用户在设置里选语言那一刻起就可能分道（浏览器 en-US + 选日本語 → 「日语标签 + 美式时间」）。现在插件把 active locale 注进行内（`activeLocale` + `subscribeLocale`，走 `ctx.locale.getLocale()` / `ctx.locale.subscribe()`）并用 `useSyncExternalStore` 订阅，切语言即时重排。`tests/rows.spec.tsx` 新增 RTL 断言：必须带 locale 参数调用，且切语言后会以新 locale 重排（该断言已用变异测试验证会红）。（EN: the update check's timestamp now formats with the DSH locale — `toLocaleString()` with no argument silently used the browser locale, which drifts from the interface language as soon as the user picks one; the row subscribes to locale switches and re-formats live）

- **语言字典删掉 6 个死键，并加一条死键守卫（YY 附带发现）**：`glass.on` / `glass.off` 在 `eeb8096` 把总开关改成「磨砂轨道 + ✓」时就失去了渲染点（那次删掉了 `{enabled ? t('glass.on') : t('glass.off')}`），**词条留着**，随后的 `bfa2f91`（加语言的提交）又把这两条复制进了 5 种语言；`flavor.latte/frappe/macchiato/mocha` 则**从未被引用**——风味按钮渲染的是 palette 里的品牌专名。共 **6 键 × 7 语言 = 42 条**，现已删除（键集 78 → 72）。`tests/locales.spec.ts` 新增死键守卫：遍历 `src` 下除字典本身以外的所有 `ts`/`tsx`，确认每个键都有字面引用，4 个模板拼接的 `flavor.<id>.subtitle` 走显式清单；**守卫已用变异测试验证会红**（临时塞一个没人引用的键即失败）。（EN: drop six dead dictionary keys — `glass.on`/`glass.off` lost their render site when the master switch became a track + check mark and were then copied into five more languages, and `flavor.<id>` was never used because the buttons render the palette's brand names — plus a dead-key guard test that walks the sources）

- **ja / ko 的「磨砂」旋钮与预设不再各说各词（YY）**：`glass.frost`（磨砂度）与 `glass.presetFrosted`（磨砂预设）在同一语言里用了两个词——日语旋钮 `曇り` / 预设 `フォグ`（fog），韩语 `프로스트` / `포그`（fog）。现各自统一为 `曇り` / `프로스트`（不引入新词，只收拢到已经在用的那个），并同步两语言 `glass.help` 里的预设列表（否则 tooltip 会指着一个不存在的预设名）。`tests/locales.spec.ts` 新增两条断言：旋钮与预设必须同词根（归一化后前缀关系，容忍 fr Givre/Givré 与 en Frost/Frosted）、`glass.help` 必须列出三个预设名。同时把 zh 的引号统一为「」（原 `row.overridesEmpty` / `update.help` 用 “”）。**本项不假装完成母语复核**：复核清单（9 条长文案 + 长度膨胀 + 遗留的 ja `すりガラス` vs `曇り` 选择）已落到 `docs/locale-review.md`，触发条件=有对应语言的用户反馈。（EN: the frost knob and its preset no longer use two different words in ja/ko — unified on the term already in use, the help tooltips now name the current preset labels, and two assertions lock the wording family plus the help/preset coupling; zh quote style unified too; the native-review checklist lives in docs/locale-review.md）

### 其他

- **预览图脚本改为关闭设置弹窗后拍摄**：此前每张风味图都是在设置弹窗打开时拍的，弹窗遮罩把整页压暗（实测侧栏读成 `182,183,186`，而 Latte 地面是 `239,241,245`）——四张预览图都是暗的。现在拍每张前先关弹窗（点关闭 → Escape 兜底 → 仍开着就直接报错，不交出暗图），再为下一风味重开；四张风味图随之重出（**图本身在本版本才提交**）。（EN: flavour previews are shot with the settings dialog closed — its mask dimmed every shot before — and the script now asserts the dialog is gone instead of shipping a dim image）

- **新增启动级 e2e 检查（CI job `boot-e2e`）**：建一个临时 `DSH_HOME`、把本仓库 `link:` 进它的 web profile、真起 `dsh web`，然后断言「插件真被加载 / 风味真生效 / 玻璃真能切」，并读取**级联后**的关键计算样式（侧栏玻璃片不得有 `backdrop-filter`、composer 卡必须保留、compat 模式下浮动面有 hairline rim 而 `panel` 不被描边）。刻意**不做整图像素对比**：断言式采样不随字体/渲染器漂移，而仓库已有的样式级断言已覆盖大半（取舍与可行性实测见 `docs/plugin-improvements.md` §3.9）。实测 CI 成本 **+54~73 s**（独立 job，与 `check` 并行，Chromium 与 pnpm store 都带缓存）。（EN: a startup-level e2e check boots a throwaway DSH_HOME with this repo linked, runs a real `dsh web` and asserts behaviour plus key-region computed styles — no image diffing; it runs as its own cached CI job）

- **语言字典审计与复核清单（YY）**：见 `docs/locale-review.md`。结论：结构层（键集 / 空值 / 占位符 `{profile}`、`{s}`）全部通过；「与 en 逐字相同」的命中项均为合法同源词（Mica / Mode / Standard / Stable / Beta / Frost），**没有漏翻**；真正需要人读的只有 9 条长文案。（EN: locale audit + checklist in docs/locale-review.md）

## [0.5.4] - 2026-09-21

### 修复

- **兼容模式的玻璃材质终于画得出来了（OO）**：`compat` 分支此前只给 `menu` / `card` / `popover` 等家族加 `blur(12px)`，**填充却是不透明的原生色**——而本皮肤把页面地面画成纯色，纯色地面上的 blur 一个像素都不变（issue #13 的同款结论），于是兼容模式读起来≈原生界面，用户以为插件没生效（真页 computed style 实测：composer 卡 `rgb(30,30,46)` 实色）。现在这些浮动家族带上皮肤自己的材质：`--dsh-glass-card-raised` 半透明填充 + `outline` 画的 hairline rim。三个刻意取舍：① **`panel` 不填**——面板会嵌套（`panel` 里是透明的 `panelBody`），两个都填会叠出宿主没有的内框（真页实测发现），它只保留 blur；② **rim 用 `outline` + 负 offset，不用 `border` / `box-shadow`**——border 会挤动 `box-sizing:content-box` 的宿主面、box-shadow 会盖掉宿主自己的投影，`outline` 两样都不碰，再加 `:not(:focus-visible)` 让共享焦点环继续生效；③ **Latte 下让它「看得出玻璃」的是 rim 而不是填充**——那里 `--dsw-alias-bg-layer-1` === `--dsw-alias-bg-base`（官方映射），填充合成后与页面地面同色，和 PP 踩的是同一个坑。`tests/glass-css.spec.ts` 新增断言锁住「浮动家族有填充 + rim」与「panel 不得被填」。（EN: compat mode finally shows a material — the blur alone painted nothing over the solid ground, so these floating families now carry this skin's translucent fill plus an `outline`-drawn hairline rim; panels are deliberately excluded because they nest panel > transparent panelBody and filling both stacks an inner rectangle the host never asked for, and no new backdrop-filter is added）

- **会话列表的选中行终于有底色了（PP）**：真页实测发现上游 **hover 与选中的行用的是同一个 6% tint**（`rgba(38,49,72,.06)`），用户只能靠那根 2px accent 条分辨「点中的是哪一行」。选中行改用 DSH 自己的选中态 token `--dsw-specific-sidebar-nav-item-active` 的 40% 填充：`card-hover` 那一族试过但**隐形**（该 recipe 与页面地面同色，铺上去逐像素不变——同一个坑）。40% 是**对比度天花板**不是审美：该行的 12px 时间戳是 `label-secondary`，对填充的对比度在 40% 时是 4.62、到 50% 掉到 4.41（低于 AA）。四风味实测标题（14px `label-primary`）对合成后填充为 Latte **5.89** / Frappé 8.29 / Macchiato 10.07 / Mocha 11.38。上游的 hover 有意保留不动（它的 6% 与面板填充差得开；改成 `card` 档会与面板同值、又变隐形）。（EN: the selected sidebar row now gets a real fill from DSH's own selected-nav token at 40% — upstream gives hover and selected the same 6% tint, so a row could only be located by the accent bar; 40% is the contrast ceiling because the row's 12px timestamp drops below AA at 50%）

- **插件市场对话框里的卡片不再是实色块（AAA，已随 `0.5.4-beta.0` 发布）**：设置 → 插件市场的插件卡片用 `--dsw-alias-bg-layer-1` 上色，而设置弹窗作用域的玻璃化重写**漏了这一档**（只重写了 `layer-2` / `layer-3` / `module-platform`），于是四五个设置页里只有插件卡片读起来像贴在玻璃上的实色板子。补上 `layer-1` 的半透明重写（用 `soft` 档，因 layer-1 低于 layer-2/3）。（EN: the plugin-market cards inside the settings dialog were left opaque because the settings-scope glass re-pointing covered layer-2/-3/module-platform but not layer-1）

- **覆盖编辑器的新建行不再在键入第一个字符时丢焦点（XX）**：草稿行按「先键名、再值」填，键名一旦是合法 `--` token，值的**第一个字符**就把草稿行转成持久化行（行被卸载、光标丢失），靠粘贴整串时无感。现在键名与值都改为非受控 + `onBlur` 提交（与已持久化行对称），打字期间输入框保持稳定。（EN: a new override row no longer loses focus on the first character typed into its value field — both draft fields now commit on blur, symmetric with the persisted rows）

### 其他

- **预览图脚本修好并端到端跑通（FF）**：`scripts/screenshot-previews.cjs` 卡了很久，此前记的「风味切换断言失败」只是表象，真因有三个：① **`page.goto('http://127.0.0.1:3080')` 没带 token** → 401 空白页 → `openSettings` 等 90s 超时（这才是那个「`设置` 定位器超时」）；② 行标题自 J 项加了 `?` 帮助徽标后，`getByText('Catppuccin 主题', { exact: true })` **恒为 0 命中**；③ 「跟随系统」在设置弹窗里有两处（外观分段 + Catppuccin 行），原 `.first()` 恢复的是错的那个。现在：token 支持 argv / `DSH_WEB_TOKEN` / 旧日志文件三路回退并在 401 时立刻给出明确报错，行内作用域改用角色定位，且**读取并恢复本机真实的原风味**、等 300ms 防抖持久化落地。四风味 + hero 图可一键重出。（EN: the preview script was actually blocked by a missing web token (401 page -> a confusing 90s timeout), an exact-text locator broken by the `?` help badge, and a duplicated follow-system control; it now resolves the token, scopes the row, and restores the user's real flavour preference）

## [0.5.3] - 2026-09-16

### 修复

- **玻璃层删掉 4 处「画不出像素」的背景模糊（issue #13）**：本皮肤把页面地面强制成纯色（`bg-base` 实色 + 亮度混合），于是**背后只有地面的玻璃面，`backdrop-filter` 就是恒等变换**——一个像素都不变，Chromium 照样提升合成层并**每帧回读** backdrop（半径 0 px 一样计费，只有 `none` 才免提升，`will-change` / `contain` 绕不开）。这正是 issue #13 实测「云母 ≈80% GPU、兼容 <30%、模糊半径无效」的机制。按面积核对后删掉 4 处纯浪费：**侧栏 `::before`**（实测 **222,996 px²** 可见模糊并集，占全页 mica 模糊面积 61%（首屏）/ 48%（会话视图），全区最大单块，列浮起后背后只有地面）、**聊天气泡**（float 与 compat 各一处——数量最多且在流式重绘区，背后同样是纯色地面）、**轨迹视图面板**（overlay 是滚动容器内的并列视图，背后不是聊天流）。保留下来的都是**确实盖住移动内容**的面（顶栏、输入框、浮动菜单、页面边缘渐变条）——删那些才是真的降级。视觉预期是**玻璃填充逐像素不变，动的只是字形抗锯齿**：磨砂观感来自半透明填充而非 blur。两轮实测（headless Chromium / playwright）：① 隔离构图（纯色地面 + 半透明填充 + 圆角，A/B 只差一条 `backdrop-filter`）内部平整区**逐像素相同**，差异仅在元素自身抗锯缘外缘——侧栏 **24/96000 像素（0.03%）、最大差 1/255**，气泡 **24/48000、最大差 1**；对照组（同样材质但确实盖住文字）**89.53% 像素不同、最大差 100/255**，说明该测法能看出差异。② 真页 A/B（本机 `dsh web`；A/B = 加回/摘掉这 4 条声明）：把玻璃面内容 `visibility:hidden` 后，气泡 **0/19184 像素（精确恒等）**、侧栏只剩 **0.3%** 且全在板子自身边缘；内容可见时侧栏 **2.81%、最大 16/255**、气泡 **15.17%、最大 64/255**——差异**全部是玻璃面上文字的重抗锯齿**（把地面换成高对比条纹的对照组达 98.28%/99.22%，证明测法有效；侧栏 blur 半径放大 12 倍而板内零变化，说明背后没有可失的结构）。**面积账**（真页 1440×900，4px 栅格取可见模糊面积的并集）：mica 由 **459,760 px² 降到 235,504 px²（−48.8%）**，mica/compat 的模糊面积比由 **4.32× 降到 2.22×**；剩下的最大 mica 独有面是**顶栏 ~95,880 px²（占 21%）**。新增 `tests/glass-css.spec.ts` 锁两条不变量（地面之上的面不得有 blur、覆盖移动内容的必须保留，并核对 composer 板内卡片保持 `backdrop-filter:none` 以免同一片像素读两遍），7 语言 `glass.modeHint` / `glass.help` 与双语 README 补上性能提示（兼容模式 = 稳妥档、清透预设最省）。**有意未做**：顶栏那句「内容从磨砂条下穿过」是本插件自己用负 margin `-95px` 造的（DSH 原版 header 在滚动容器上方、不重叠），退掉它能把顶栏的 blur 也变成静态地面（成本归零、但失去该效果）——留作 issue #13 复测不达标时的第二手。（EN: drop 4 backdrop-filters that painted nothing — the page ground is solid, so blurring it is an identity transform still billed every frame; measured on the live GUI, the frosted fill is pixel-identical with the blur removed (0/19184 with the surface's content hidden) and the only pixels that move are glyph re-antialiasing above the surface, while the sidebar sheet, chat bubbles and the trajectory panel lose a no-op blur and the top bar / composer / menus keep theirs, with a regression test locking both halves and per-language performance notes in the settings row; the visible blurred area drops from 459,760 to 235,504 px², i.e. the mica/compat surface ratio falls from 4.32× to 2.22×）

- **删掉一条永不命中的输入框占位色规则（issue #12）**：`[data-dsh-glass-float] [data-composer-card] textarea::placeholder`（`color-mix(label-primary 45%, transparent)`）从来画不出像素——DSH 的 composer 是 contenteditable，占位提示是 `div[data-composer-placeholder]`，颜色由 DSH 自己的 `--dsw-alias-label-caption` 决定；实测 `[data-composer-card]` 内 textarea 数量在两版 DSH（0.1.2-rc.1、0.1.5-rc.2）都是 **0**。它不生效却在注释里自称 "scheme-adaptive"，是个陷阱：浅色片上 45% 的 `label-primary` 只有 **2.1:1**（深色片 3.2:1），正是 issue #12 里被误读成「玻璃把提示洗掉」的数值。删掉后实测 Latte + 云母下提示色 = Latte caption `#7c7f93` on `#eff1f5` = **3.5:1**；报告人截图里的 2.1:1 来自**官方浅色主题**自己的 caption `#adb2b8` on `#fff`（与 Catppuccin 调色板、与玻璃层都无关）。（EN: drop the unreachable `textarea::placeholder` rule from the glass layer — DSH's composer is a contenteditable + `div[data-composer-placeholder]`, so the rule painted nothing while claiming a scheme-adaptive tint it never applied）

- **Latte 弱标签阶梯补上断言（issue #12 附带发现）**：`tests/palettes.spec.ts` 的 WCAG 下限只跑深色三风味（`DARK_FLAVORS`），Latte 完全没覆盖。实测 Latte 弱标签在 `#eff1f5` 上：primary 7.06 / primary-dimmed 7.06 / secondary 5.53 / tertiary 5.53 / caption **3.49** / dimmed **2.30**。评估过「把 caption 抬到 AA」：bluish-500 `#6c6f85` 只到 4.37:1，要过 4.5 必须用 bluish-600 `#5c5f77`（5.53，正是 secondary/tertiary 的值）→ 会压平两级阶梯；而官方浅色主题自己的 caption 是 `#adb2b8`（2.14:1 on 它自己的纯白输入框），Latte 的总实映射已经比上游强 1.6 倍——按规则 1「拿不出『官方取值在 DSH 下不成立』的证据就不偏离」，**结论：保持现状**，改为落地断言：锁住每个别名的官方步进 + 实测减余量的下限（变浅或压平都会被打回）。（EN: add the missing light-flavour label ladder test — Latte keeps the official step mapping because its caption already beats upstream's own light caption 3.49:1 vs 2.14:1; reaching AA would flatten two ladder levels, so the test locks the ladder instead）

- **覆盖编辑器的值输入改为失焦提交（TT）**：此前值输入受控 + 逐键提交，而「空值 = 删除」→ 想改颜色时逐字符清空会在中途把整行（含正在打字的输入框）卸载、光标丢失；同时**每个字符都会 dispose 并重新注册一次主题**（700 个 token 的表），中间态（如 `#89b4`）还是无效 CSS。现在键名与值都是非受控 + 失焦提交：清空后失焦才删除，打字期间行稳定、主题不再逐键重建；7 语言的 `row.overridesHint` 已同步为「失焦生效」。**有意接受的取舍**：不再「边打边变色」（粘贴完整色值不受影响）、焦点未离开就关弹窗时最后一笔不提交、其它标签页 / settings 文档写入的值需重开弹窗才刷新——三者与既有键名输入完全一致。（EN: the override editor's value field now commits on blur like the key field — clearing a value no longer unmounts the row mid-typing and typing no longer re-registers the theme per keystroke）

- **普通提交现在也有 CI 了**：新增 `.github/workflows/ci.yml`（push main / PR → install + typecheck + build + test，只读权限）。此前只有 `publish.yml`、且只在 `v*` tag 上触发，所以 main 上的提交从来没人验证——`0.5.2` 当天两次发版失败（未声明的幽灵类型依赖、跨测试污染）都是本地恰好过、到 tag 才暴露。（EN: CI now runs on every push to main and on PRs, so regressions no longer wait for a release tag）

- **补了行级组件测试骨架**：引入 `@testing-library/react`（配 `react-dom` 18，与 peer 范围一致），新增 `tests/rows.spec.tsx`：覆盖编辑器（TT 的失焦提交语义、清空后失焦才删、未改动不写入、键名重命名与非 token 键）与玻璃旋钮的 `aria-valuetext`（Z）。两个 row 的依赖都是 props，所以用注入面 fake 渲染，不需要模块全局。（EN: component-level test harness for the settings rows）

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

[Unreleased]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.7-beta.0...HEAD
[0.5.6]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.5...v0.5.6
[0.5.6-beta.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.5...v0.5.6-beta.0
[0.5.5]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.5.1...v0.5.2
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