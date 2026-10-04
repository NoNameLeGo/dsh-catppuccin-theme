# AGENTS.md — dsh-catppuccin

给本仓库的 Agent（以及人类维护者）的项目速览与发版 SOP。开始改代码前请先读「项目定位与核心目标」与「项目身份速览」，**惯例是这里踩过坑的集结点**；文末「与报告人协作」「本机测量资产」两节是本轮（issue #12 / #13）新增的。

## 项目定位与核心目标（判断「该不该做」的准绳）

**核心目标是「适配」，不是「设计配色」**：按 [Catppuccin 官方源配色](https://github.com/catppuccin/catppuccin)（`palette.json` v1.8.0）把 DeepSeek Harness 的官方 `--dsw-*` token 体系**完整**映射成四个风味。**官方色板是准绳，不是教条**——官方取值在 DSH 的实际用法下真不成立时（有证据）可以改，走规则 1；**玻璃质感（Glassmorphism）是叠加在正确配色之上的视觉皮肤，属附带目标**——它只改材质，不改配色。

权威数据源（由 `scripts/generate-palettes.mjs` 读取，均在仓库外的缓存）：

| 文件 | 作用 |
|---|---|
| `<缓存>/.cache/dsh-ref/dsw-tokens.json` | 官方 design-platform.css 解析出的 `--dsw-*` token 全表——**要全覆盖，不许漏 token** |
| `<缓存>/.cache/dsh-ref/catppuccin-palette.json` | 官方 Catppuccin 色板 v1.8.0——**默认取色来源**（官方取值在 DSH 下确实不成立时按规则 1 的例外流程偏离） |

> 路径基准：脚本里写的是 `join(__dirname, '..', '..', '.cache', 'dsh-ref')`（**相对 `scripts/`，往上两级**），
> 本机实测 = `D:\Vibe-Coding\.cache\dsh-ref\`（2026-09-24 校验：目录存在，含 `dsw-tokens.json`、
> `catppuccin-palette.json` 与各 tag 的 `design-platform-*.css`）。换机器时改成自己的缓存盘即可。
| 产物 `src/client/palettes.ts` | 生成物；同源产物还有 `themes/`（`pnpm gen:themes`）与 shiki token 表 |

> **两层「官方」不要混淆**：(a) **Catppuccin 源色板** —— 取色来源；(b) **DSH 官方 token 的取值与语义** —— 被适配对象。改 (b) 是本插件存在的理由（例如整族重映射 `brand-primary` 到风味蓝），不需要理由；改 (a) 才需要证据（规则 1）。

### 由此推出的四条硬规则

1. **以官方色板为默认来源，偏离需要证据。** 每个 `--dsw-*` 的取值默认是官方 26 色本身、或由它们 `color-mix` 出来的中间值；**不得凭观感发明色相**（「这个蓝有点闷，换 sapphire」不是理由）。但当官方取值**在 DSH 的实际用法下确实不成立**时——例如该色被 DSH 用在对比度不达标的场景、或该 token 在 DSH 里被用在官方设计没有的场景——**可以改**，过下面三条即可：
   - ① 有可复核的证据（实测对比度数字 / 用户 issue / 上游设计差异）；
   - ② 已穷尽「不换色相」的手段（混色目标、层级档位）仍不达标；
   - ③ 在代码注释 + CHANGELOG 写明**与官方取值的差异及理由**，并补上锁定该决定的断言。
2. **改颜色只改映射表。** 调 `scripts/generate-palettes.mjs` → `pnpm gen:palettes` → 提交生成物；手改 `palettes.ts` 下次生成即被覆盖。
3. **对比度问题先换手段，再换颜色**：第一步永远是不换色相的调整——混色目标（`base` → `crust`）与层级档位（先例：issue #7、issue #11、VV）。仍不达标时按规则 1 的例外流程偏离并记录：已有两个**记录在案的有意偏离**——① Latte `--dsw-static-blue-900`：该步被 DSH 当作浅色徽章（hero「预览版」）上的**文字**用，通用浅色计划把它混向 `base` 会洗成淡色，故改混向 `text`（`generate-palettes.mjs` 内有完整注释）；② `brand-primary` 整族：DSH 官方品牌蓝与 Catppuccin 主题冲突，直接重映射为风味蓝（生成器头部注释说明）。
4. **玻璃层不得改变配色语义。** 玻璃只动 alpha / blur / rim / shadow；开关关闭时必须回到与官方色板逐 token 一致的纯色形态。**推论（issue #13 实测）**：本皮肤把页面地面强制成**纯色**，所以「背后只有地面」的玻璃面上加 `backdrop-filter` 是**恒等变换**——填充逐像素不变（隐藏该面内容后 A/B：气泡 **0/19184 像素**），代价却是 Chromium 每帧回读 backdrop（**半径不参与**；`will-change` / `contain` 绕不开，只有 `none` 免提升）。**新增 blur 前先问一句「这个面背后是不是只有纯色地面」**，`tests/glass-css.spec.ts` 双向锁定（地面之上的面不得有 blur、覆盖移动内容的必须保留）。唯一已知的可见副作用不是降级：面变成合成层后，**面内文字会重抗锯齿**（≤16/255 侧栏、≤64/255 气泡）。
   **推论二（issue #19 实测，同样必须记）：不要把 blur 加在「托管浮层」的容器上。** 带 `backdrop-filter` 的元素会成为其后代的 **backdrop root**，后代只能读到**该元素自己画的那层**（页面内容不在其中）；命令面板 `[data-trigger-menu]` 就挂在 `[data-composer-card]` 的 `conversation.input.overlay` 锚点里，且整块**悬在卡盒之外**，于是它自带的 `blur(40px)` 读空 ⇒ 底下的转录原样透出。**推论：材质必须整体搬到容器内部的 `::before` 材质面（填充 + blur 都要，别只搬 blur），容器本体保持零绘制**——这正是上游 `MenuSurface.module.css` 的做法（`isolation: isolate` 外壳 + `z-index:-1` 材质面，其注释原话就是「keeps nested menus free of an ancestor backdrop root」）。`isolation: isolate` **不是** backdrop root，可以放心用。护栏 = `tests/glass-css.spec.ts` 的 `backdrop-root hygiene` 一组；判定手法与实测数字见 `skills/css-backdrop-root-probe` 与 `docs/issue-19-palette-blur.md`。

### 用这条准绳做过的判定（可引用的先例）

- 2026-09-15 **驳回** MM（暗色主 accent 提亮）：驳回理由**不是「官方色不许动」**，而是它拿不出「官方取值在 DSH 下不成立」的证据（`#89b4fa` / `#8caaee` 在 `crust` 上远高于 AA，属审美偏好而非缺陷），且 `brand-primary` 已被 `tests/palettes.spec.ts:105` 锁成契约。想要更亮的主操作色走 **K（token 覆盖）**，不走 palette。
- 2026-09-15 **立项** VV（success / warn tertiary 对比度）：实测 3.18~4.37 低于 AA，就是「官方取值在本项目不成立」的那类证据；修法仍走第一步（只换混色目标、色相不变）——规则 1 与规则 3 各占一半。

两次判定的完整理由见 `docs/plugin-improvements.md`（「六、2026-09-15 复核」）。

## 项目身份速览：三套名字，不要混淆

这个仓库同时存在三套不同的「名字」，改动前必须先分清（2026-08 仓库改名时踩过一次坑）：

| 名字 | 值 | 说明 |
|---|---|---|
| GitHub 仓库名 | `NoNameLeGo/dsh-catppuccin-theme` | 已从 `dsh-catppuccin` 301 改名，GitHub 自动跳转旧链接 |
| npm 包名 | `@nonamelego/dsh-catppuccin` | **不要改成 `-theme`**——安装/更新检查代码都依赖它（`src/update-check.ts` 的 `PACKAGE_NAME`、`cordis.patch.yml` 的 `name`、README 里的安装/升级命令） |
| 插件 ID / 显示名 | `dsh-catppuccin` | `src/index.ts:54` 的 `export const name`；运行时的 Cordis 插件身份，不可改 |

- 代码/配置里 `grep dsh-catppuccin` 命中的大多数**都不该改**。只有**完整的 GitHub URL**（`github.com/NoNameLeGo/dsh-catppuccin`，不带 `-theme`）才需要更新为新仓库名。
- npm 包名、插件 ID、本地路径 `link:D:\Vibe-Coding\dsh-catppuccin`（README 里的本地开发命令）一律保持原样。
- `git remote` 的 `origin` 指向 `https://github.com/NoNameLeGo/dsh-catppuccin-theme.git`。

## 上游形态与维护核心（2026-09-22 定）

**维护核心 = 官方的 web + desktop。** 官方上游是 monorepo
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)：

| 上游位置 | 是什么 | 与本插件的关系 |
|---|---|---|
| `apps/web` | Web GUI（`dsh web` / `web` profile） | **核心**：`--dsw-*` token 体系与玻璃层的适配对象 |
| `apps/desktop` + `apps/desktop-host` | 官方 Electron 桌面壳（`private: true`；**已作为客户端发行**，2026-10-02 本机装机版 = `@deepseek-ai/dsh-desktop@0.2.0-rc.2`，仍在开发迭代），启动 `$DSH_HOME/profiles/desktop` | **核心**：装/升走**应用内插件界面**（见下「两个壳两条路」），**不是** `--profile desktop` 那条命令 |
| `apps/cli` → npm `@deepseek-ai/dsh` | CLI：profile 启动 / `dsh plugin` 转发 pnpm | 安装与更新检查的宿主；⚠️ **对 `desktop` 这个 profile 名会硬拒**（见下） |
| （社区）`anywhere-labs/dsh-desktop`（原名 `deepseek-harness-desktop`） | 第三方桌面壳，**同一个 `profiles/desktop` 路径**；yarn workspace 含 `dsh-plugin-desktop` / `dsh-desktop-next` / `dsh-community-market`（内置插件市场）等 | 兼容保留，非核心；装/升**走应用内 DSH 终端的命令**（见下） |

**两个桌面壳都不是「另一个 DSH」**（2026-09-24 核对，别按印象写）：

|  | 官方壳（`apps/desktop-host`） | 社区壳（`anywhere-labs/dsh-desktop`） |
|---|---|---|
| 自带的 DSH 版本 | 与官方 monorepo 同步（`app.asar` 内 `dsh/package.json` = `@deepseek-ai/dsh-desktop-runtime`，2026-09-30 实测 **0.2.0-rc.2**；这个 app 自 0.1.7-alpha.1 起存在，**未发 npm**） | 无自带版本，启动**用户自己装的** `@deepseek-ai/dsh` |
| Web 端口 | 固定 `--port 19387`（`src/index.ts` 写死） | 默认 `43120`（`DESKTOP_DEFAULT_WEB_PORT`），仅绑定冲突时顺序 +1（≤32 次）；2026-08-21 起「prefer a stable loopback port」 |
| 识别信号 | ⚠️ **profile 进程里没有专用信号**（2026-09-24 证伪，见下）：`DSH_DESKTOP_NODE_EXECUTABLE` 只注入给包安装子进程；可用替代信号 `process.versions.electron` | `desktopProfiles` 服务；**`dsh-desktop-next` 重写版同时也会设 `DSH_DESKTOP_NODE_EXECUTABLE`** |

⇒ 结论：**settings seam 的适配与「哪个壳」无关**，只取决于该壳启动的那份 DSH 提供哪个服务（官方壳 = 0.1.7 线 → `configForms`；
社区壳跟随用户所装版本）。两路识别信号则同时覆盖两个壳，且官方壳那条路在 `dsh-desktop-next` 上也成立。

### 官方桌面壳的插件相关契约（2026-09-30 在 0.2.0-rc.2 上复核，全文见 `docs/desktop-0.2.0-adaptation-audit.md`）

本机官方壳自带 `@deepseek-ai/dsh-desktop-runtime@0.2.0-rc.2`（= 上游 HEAD = npm `latest`），它与插件耦合的面就这几条，
改动玻璃/设置/持久化前先对一遍：

| 契约 | 位置（0.2.0-rc.2） | 插件侧 |
|---|---|---|
| 页面 origin 是自定义协议 `dsh-app://app/`，Web host 仍在 `http://127.0.0.1:19387`（**写死**） | `lib/main.js` 的 `SCHEME`；`dsh-desktop-host/lib/index.js` 的 `runProfile({ args: ['--no-open','--port','19387'] })` | 不依赖 origin 做持久化（走 host 侧文档） |
| Host 由 **Electron 以 node 模式**起（`ELECTRON_RUN_AS_NODE=1`，`DSH_DESKTOP_NODE_EXECUTABLE` 仍只给包安装子进程） | `lib/main.js` `DesktopHostProcess.start()` → `desktopNodeEnvironment(this.node, void 0, …)` | `isElectronRuntime()`（`process.versions.electron`）仍是唯一 profile 进程信号 |
| Windows：preload 给 `<html>` 挂 `data-windows-titlebar` + `--dsh-windows-titlebar-height: 40px`，`ui-layout` 据此在所有列上方预留标题栏 | `apps/desktop/src/preload-windows.ts` / `windows-layout.ts` | 顶部渐隐在该标记下 `display:none`（`glass.module.css`）——那条里没有滚动内容，模糊是恒等读取 |
| Windows 标题栏取色：preload 插探针读 `--dsw-specific-sidebar-fill`（填充）与 `--dsw-alias-label-primary`（符号），经 1×1 canvas 折算成 `rgba()` 交 `setTitleBarOverlay` | 同上 | 两个 token 必须解析成不透明色（`tests/palettes.spec.ts` 的护栏用例）；2026-09-30 真机实测发到主进程的是 `rgba(24,24,37,1)` / `rgba(205,214,244,1)`，窗口 `y≥32` 像素正好 `#181825` |
| Windows 标题栏菜单（应用/编辑）用 shadow DOM 挂在 `[data-shell-overlay]` 之后，消费 4 个 `--dsw-alias-*` token + `--dsw-font-family` | `apps/desktop/src/preload-menu.ts` | 全在映射表内；插件不碰 `[data-shell-overlay]` |
| `html[data-ds-theme-source]` → 主进程 `nativeTheme.themeSource`（原生 chrome / Platform 登录页 / macOS vibrancy 跟随） | `apps/desktop/src/preload-theme.ts` | 插件用 `theme.setTheme()` 强制亮暗，实测桌面下 `themeSource=dark` 与风味一致 |
| macOS：`html[data-platform='darwin'] body` 把 `--dsw-specific-menu` 覆写成 94% 不透明；主窗口 `vibrancy: sidebar` | `design-platform.css` 的 darwin 块；`lib/main.js` `createWindow()` | ⚠️ **未适配**：我们无条件覆写该 token，macOS 上的近不透明变体丢失；本机无法验证 |

> 桌面壳专属 token `--dsw-desktop-window-tint` 只被欢迎窗口（`renderer/welcome.html`）消费，那份窗口自带整套字面量 token
> ⇒ **不需要插件映射**（2026-09-30 由出厂包逐文件扫描确认）。
> 另：`cordis_inspect_query` 的 client Service **目录不是全集**（`configForms` 就不在里面，但 0.2.0 里一堆官方包在用它）
> ⇒ 别拿目录当「服务不存在」的证据。
>
> **⚠️ 桌面版装/升插件：两个壳两条路，互不通用（2026-10-02 复核 + 维护者实测）**
> - **官方壳（Electron）**：**安装** = 应用内**插件界面**填包名 `@nonamelego/dsh-catppuccin`；
>   **升级** = 在插件界面里**先删除、再重新填一遍同一个包名安装**（v0.2.0 既无升级入口也无版本选择器，
>   上游 UI 自己的话是「插件安装后暂不支持自动更新：升级需先卸载再安装新版」）。
> - **社区壳（`anywhere-labs/dsh-desktop`，仓库已从 `deepseek-harness-desktop` 改名）**：
>   **安装/升级都走命令**——应用内 **Open DSH Terminal** 里 `dsh plugin --profile desktop add|update @nonamelego/dsh-catppuccin`
>   （壳在终端里生成私有 `dsh`/`pnpm`/`node` shim，PATH 只对该终端生效）；图形侧还有内置的
>   Community Market（只有「安装/卸载」，没有升级）。
> - **系统 PATH 上的普通 `dsh` 两个壳都管不了 `desktop`**：`@deepseek-ai/dsh/lib/bin.js` 的
>   `parseDshArgs(argv, version, manageDesktopProfile = false)` 在 `manageDesktopProfile` 为 false 时调
>   `rejectElectronProfile()` → `error: profile "desktop" is managed exclusively by the Electron application`
>   （按名字硬拒、大小写不敏感）。实测：`node <0.2.0-rc.2>/lib/bin.js plugin --profile desktop list` 报上面这句，
>   `--profile web list` 正常。**只有桌面壳自己的 CLI 入口会传 `manageDesktopProfile: true`**
>   （官方壳 = `resources/runtime/cli/bin/dsh.cmd` → `dsh-desktop-host/lib/cli.js` 的 `runDesktopCli()`，
>   同时把自带的 pnpm 11.7.0 作为 `packageManager` 传下去）。⚠️ **但维护者实测两个壳的路径互不通用**，
>   所以 README 里**不要**给官方壳写 CLI 指令、也不要给社区壳写「删掉重装」。
> - **壳的判别（2026-10-03 定，取代早先「插件分辨不出是哪个壳」那句）**：`classifyShell()`
>   （`src/profile-detect.ts`）把宿主分成 `web` / `community-desktop` / `official-desktop`——
>   **先判两条社区信号，剩下的 Electron 运行时就当官方**：
>
>   | 信号（在 profile / host 进程里） | 官方壳 | 社区壳 Stable/Beta | 社区壳 Next | 纯 node |
>   |---|---|---|---|---|
>   | `DSH_DESKTOP_NODE_EXECUTABLE`（host env） | ❌ | ❌ | ✅ | ❌ |
>   | `desktopProfiles` 服务（`current.name`） | ❌ | ✅ | ❌ | ❌ |
>   | `process.versions.electron` | ✅ | ✅ | ✅ | ❌ |
>   | **⇒ 判定** | `official-desktop` | `community-desktop` | `community-desktop` | `web` |
>
>   官方侧证据（2026-10-03，`resources/app.asar` 直接 grep）：该变量在壳内**只有 3 处命中，且全部在
>   `packageManager.env` 里**——即交给 **pnpm 包安装 / CLI 子进程**的那份 env
>   （`runCli({ manageDesktopProfile: true, packageManager: { env } })`）——host 子进程走的是
>   `desktopNodeEnvironment(this.node, void 0, this.environment)`，`bin === undefined` 取
>   `{...壳 env, ELECTRON_RUN_AS_NODE: '1'}`，**不设**那个 marker；`desktopProfiles` 在官方 0.2.0-rc.2
>   出厂包集合里 **0 命中**。社区侧：`dsh-desktop-next/src/host/index.ts` 给 host 设
>   `DSH_DESKTOP_NODE_EXECUTABLE`，`dsh-plugin-desktop/src/profile-service.ts` 注册 `desktopProfiles`。
>   顺序是判据的一部分：社区信号先判，否则跑新版 Electron 的社区壳会被官方分支吃掉。
> - **升级文案按壳分流**（设置页「检查更新」）：`web` / `community-desktop` 给 CLI 命令
>   （`updateCommandFor()` → payload 的 `updateCommand`）；`official-desktop` **不给命令**，
>   改给 `pkg@tag` 包名（`pluginSpecFor()` → payload 的 `updateSpec`）+ 「插件界面里先删除、再重装」
>   的指引（= README「桌面版」那条官方升级路径）。理由：官方壳用户**没有可达的终端入口**
>   （`resources/runtime/cli/bin/dsh.cmd` 代码上允许 `manageDesktopProfile: true`，但壳 UI 不给终端）。
>   护栏：`tests/profile-detect.spec.ts`（6 条判定）、`tests/e2e/update-check.e2e.spec.ts`（三种壳各一条
>   真路由断言，含 `updateCommand`/`updateSpec` 的互斥）、`tests/rows.spec.tsx`（三种壳的渲染文案与按钮名）。
>   三条支路都做过变异验证（删 desktopProfiles 分支 / Electron 恒返回 web / 客户端忽略 `official-desktop`）⇒ 会红。
> - ⚠️ 缓存陷阱：e2e 里那三条壳断言**共用一个 cache bucket**，必须按 mock 时钟**递增**推进
>   （30 / 60 / 90 分钟）。推同样的量会正好落在上一条自己 stamp 的未来时间点上，静默复用它的裁决 ⇒
>   即使把分支删掉断言也绿（2026-09-24 实测到这个假绿，2026-10-03 把顺序写进注释）。
> - 回答用户「升到最新版了吗」之前，先问清是哪个壳 + 走的哪条路。

**⚠️ 别再写「Desktop 每次启动用随机端口」**：两个壳都是固定端口，localStorage 的 origin 跨重启稳定。持久存储的理由是
「localStorage 是 per-browser / per-origin，DSH home 才是机器级真源」（多浏览器、清站点数据、第二个实例落到 43121 这类
情形），不是「每次启动都空」。这条错误叙述在注释/README 里存活了三个版本，2026-09-24 更正。

**桌面识别：社区壳那一路有效，官方壳那一路 2026-09-24 被证伪**（`src/profile-detect.ts`）：

- 社区壳：`ctx.get('desktopProfiles')` 服务（`src/update-check/host.ts` 探测）——**仍然有效**；
- ~~官方壳：环境变量 `DSH_DESKTOP_NODE_EXECUTABLE`~~ **❌ 不成立**。上游架构说明原话：「Host 继承调用者的 PATH，
  不加入 Desktop 私有的 `bin` 目录，因此 PTC 和 agent shell 不会通过该目录解析内部启动器。**`DSH_DESKTOP_NODE_EXECUTABLE`
  仅为包安装注入。**」（`.agents/notes/implemented/architecture/2026-09-11-desktop-electron-node-runtime.zh.md`）。
  代码印证：`apps/desktop/src/host-process.ts` 用 `desktopNodeEnvironment(this.node, undefined, …)` 起 host，
  而 `bin === undefined` 时**不设**该变量（`apps/desktop/src/node-environment.ts`）；`apps/desktop-host/src/index.ts`
  只在 `runProfile({ packageManager: { env: { … } } })` 里给它——那是**包安装子进程**的环境，不是 profile 进程的。
  ⇒ **官方桌面壳下 `isDesktopShellEnv()` 恒为 false**（更新行退化成纯 web 文案；profile 名仍对，靠扫 `profiles/` 目录命中 `desktop`）。
  **已实测的替代信号**：Electron 以 node 模式跑时 `process.versions.electron` 有值（本机实测 `37.10.3`），纯 node 下是 `undefined`。
  现有两路断言锁的是**旧假设**，改判据时要一并改：`tests/profile-detect.spec.ts`（纯函数）+
  `tests/e2e/update-check.e2e.spec.ts`（真路由，曾变异验证会红）。

**推论**：新增依赖上游形状的判断时，上游的 `apps/*` 是唯一事实来源——用 `gh api repos/deepseek-ai/deepseek-harness/contents/<path>`
直接读源码（`desktopProfiles` 这类服务名就是这么做出来的对照），别按印象写。

## 插件卡片图标契约（Plugins 页，2026-10-02 在 0.2.0-rc.2 上取证）

Plugins 页每个 bundle 卡片的图标来自 **Host 读取的包元数据**，不是客户端自带资源——没声明就回落成默认图案。
判定链全部落在 `@deepseek-ai/dsh-app-boot`（`lib/index.js` 的 `package-meta.js` 区段 → `iconOf()`）：

| 环节 | 位置 | 规则 |
|---|---|---|
| 声明 | `package.json` 的 **`icon`** 字段 | 必须是**相对路径**（绝对路径或带 `scheme:` 一律 throw），且必须留在 manifest 目录内 |
| 格式 | 同上 | 扩展名白名单：`.svg` `.png` `.jpg` `.jpeg` `.webp` |
| 体量 | `MAX_ICON_BYTES` | 原始字节 **≤ 256 KiB**（超了 throw，不是降级渲染） |
| 读取 | `iconOf()` | `readFileSync` → `data:<mime>;base64,…` 内联；**不缩放、不裁切、不改色** |
| 渲染 | `dsh-client-ui-plugin-manager` 的 `.cardIcon` | 容器 **48×48**、`.5px solid var(--dsw-alias-border-l3)`、`border-radius: var(--dsw-radius-lg)`（16px）；内部 `<img class="packageImage">` 是 **36×36 + `object-fit:contain`** |

- **`files` 必须带上图标文件**：Host 读的是**安装后**的包目录，漏进 `files` 就是「仓库里有、tarball 里没有」。
- 取值路径：`metaOf(name, base)` → `pluginPackages` 服务（`dsh-app-boot` 注册）；客户端只消费 `pkg.meta.icon`。
- **别指望圆角是圆形的**：容器恒为「圆角方 + 描边」。透明四角的 PNG ⇒ 读感是「方框里悬着一枚圆」（36px，距框边 6px）；
  想要「方形满幅」得让**资源本身**是满幅方形——`dsh-context` 的 `icon.svg` 就是 1024×1024 满幅图形，所以它看起来是实色方块。
- 护栏：`tests/plugin-icon.spec.ts` 逐条镜像上面五条（相对路径 / 白名单扩展名 / ≤256 KiB / `files` 收录 / PNG 魔数）。
  两条变异（从 `files` 移除、扩展名改 `.bmp`）都实测会红。
- 选型对照脚本：`.debug/icon-preview/gen.mjs`（按**真实 `cardIcon` 取值**渲染候选牌面 + 3× 放大图）。**不入库**。

## 插件详情页的设置区（`plugins.bundle.config`，2026-10-04 在 0.2.0-rc.2 上取证）

插件自身详情页（点开插件卡片那页）中间那块「标签 + 下拉」的设置区**不是自动表单，是插槽**——**谁注册谁显示**，
不注册整块不渲染（我们此前的状态）。机制全部在 `dsh-client-ui-plugin-manager` 内：

| 环节 | 事实 |
|---|---|
| 渲染点 | `PackageDetail`（组合包页）：`renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })`，**仅当** config ledger 的 `bundles` 集合里有该包名；下面才是 `RowsSection`（「包含的组件」） |
| 另两个兄弟插槽 | `plugins.item`（官方插件卡片 + summary/page，官方 `ui-settings-agent-loop` / `-shell` 走这条）与 `plugins.row.config`（key = `` `${bundle}#${rowId}` ``） |
| **key 是什么** | **bundle 的 npm 包名**（`entryKey: pkg.name`）。本插件 = `@nonamelego/dsh-catppuccin`（= `update-check.ts` 的 `PACKAGE_NAME`），**不是** profile 条目 id `dsh-catppuccin` |
| 注册式样 | `configForms.whileServed([ns], () => slots.inject('plugins.bundle.config', () => slots.register({ name, key, locale, inject }, Card)))`；`whileServed` 保证命名空间不再被服务时**撤掉**区块，而不是留一个空块 |
| 插槽组件拿到什么 | 页面把 `form`（= `configForms.get(entryId)` 控制器）作为 prop 传进来（`plugins.item` 明确带 `form`；本插件自绘，走自己的 `DurableScope`，不依赖该 prop） |
| `slots.inject` 语义 | 等**插槽被声明**（`subscribeDeclaration` + `declarationEpoch`）；未声明就永不触发，**不抛错也不挂起** ⇒ 没有 Plugin manager 的宿主上天然静默 |
| ⚠️ `autoGenerate` 是惰性的 | Host 的 `describe()` 只把 `autoGenerate`（`presentations.get(fiber)?.auto ?? true`）写进 descriptor，**不过滤** `namespaces`；客户端唯一消费点是该页的 `formFor(id)`，它只查 `ns` 在不在。⇒ **去掉 `configure({ auto: false })` 不会让详情页长出表单**（上游文档原话：默认开启，供按 schema 生成页面的客户端使用，目前没有已发布的客户端这样做） |
| 参照实现 | 本机 `~/.dsh/profiles/desktop/node_modules/dsh-context/lib/client.js`（`plugins.bundle.config`，key = 自己的包名）与壳内 `ui-settings-agent-loop`（`plugins.item`） |

- 本插件落地：`src/client/detail-card.tsx`（复用三条行组件）+ `src/client/index.ts` 末尾的注册；**数据层零改动**（两个入口共用
  `CATPPUCCIN_ENTRY_ID` 那一份 durable section）。SlotMap 成员在 `detail-card.tsx` 内**本地声明**——我们的 devDep 停在 0.1.7 线，
  早于 Plugin manager；将来升依赖时若上游也声明了它，同形状会合并、异形状会编译报错（那就是删掉本地声明的信号）。
- 护栏：`tests/reentrancy.spec.ts` 的「Plugins-page card」一组 5 条（key = `PACKAGE_NAME`、`whileServed` 的 gate、无 `whileServed` 的宿主、旧 seam 上不注册、key 等于 manifest `name`）
  + `tests/rows.spec.tsx` 的组成断言（三条行 + schema 表单渲染不出的那些控件）。
- 相关配置（Host 侧，别混）：`src/index.ts` 仍 `configure({ auto: false })` —— 它表达的是「本插件自带 UI」，与详情页区块是否出现无关。

## DSH STORE 上架状态与契约（2026-09-24 核实，issue #1106）

商城（[`AI-Scarlett/DSH-Store`](https://github.com/AI-Scarlett/DSH-Store)）里我们的条目 `id = dsh-catppuccin` 是
**`status: blocked` + `updatePolicy: external-only`**：商城不提供安装按钮，但**保留 GitHub 手动安装入口和风险原因**，
已有用户仍可 `dsh plugin add`。每 8 小时自动复检一次，会跟随默认分支的新 Commit 自动刷新版本与元数据。

- **自动批准（`source-verified`）对本插件结构性不可达**，别再去试。`registry/automation-policy.json` 的
  `automaticApproval` 要求：无 `preinstall/install/postinstall/prepare`、无 `dependencies`、显式 `files`、
  声明 DSH 与 Node 兼容，**且**运行时代码里 `files/network/commands/credentials/protectedDsh/nativeOrExecutableArtifacts`
  信号**全为零**。扫描面 = 仓库里除 `node_modules|vendor|test|tests|docs|examples|fixtures|benchmarks|coverage|.github`
  之外的所有 `.ts/.tsx/.js/.mjs/.cjs/.json/.yml/.sh/.py`（**`scripts/` 也算运行时源码**；`*.map` 不算）。
  ⇒ 我们读 `$DSH_HOME`、写 `~/.dsh-tui/themes/`、fetch npm registry，**必然红灯**。
- **兼容窗口的算法**（`src/dsh-release-policy.mjs`+`dsh-release-policy.js`）：取 dist-tag 里**除 `next` 外**的最高
  支持版本作 target，再取 ≤ target 的最高三版。**窗口会随上游 dist-tag 移动，不是常量**：
  - 2026-09-24 实测 `{0.1.7-alpha.1, 0.1.7-alpha.2, 0.1.7-rc.1}`（当时 target = `alpha` 的 `0.1.7-alpha.2`）；
  - **2026-09-30 实测 `{0.1.7-rc.2, 0.2.0-rc.1, 0.2.0-rc.2}`**（target = `latest` 的 `0.2.0-rc.2`；`next` 也是 0.2.0-rc.2、
    `alpha` 反而退到 0.1.7-alpha.2）——**声明没跟上的那两天，窗口内 `compatible` 命中为 0**，所以每次上游发版后
    用 `.debug/dsh-store/verify-manifest.mjs` 复算一遍，别只看记忆里的窗口。
  规则：**窗口内 ≥1 条 `compatible` 即可**；`approved` 条目三者全非 `compatible` 会转 `unlisted`。
- **声明写在 `package.json` 的 `dsh.compatibility`**（`dsh` 范围字符串 + `dshReleases` 逐版本 + `dshOperations` 逐版本
  `install/start/uninstall/rollback`，值 `passed|failed|unknown`）。这是 **store 专有**字段：上游
  `@deepseek-ai/dsh-package-manifest` 的 `DshManifest` 里没有 `compatibility`，上游也不解析它。
  ⚠️ **绝不能用 `peerDependencies` 里的 `@deepseek-ai/dsh` 范围声明兼容**：上游 `dsh-app-boot` 的
  `evaluatePluginCompatibility` 会据此判定，不满足就**跳过整个 bundle**（`>=0.1.5` 对 `0.1.5-rc.3` 为假）。
- 复现工具：`.debug/dsh-store/`（对方策略源码副本 + `probe-exact.mjs` 逐文件跑信号 + `probe-window.mjs` 算窗口 +
  `verify-manifest.mjs` 用对方函数校验本仓库 manifest）。**不入库**。
- 顺带发现：商城条目名/分类是错的（「用量统计看板（DSH Catppuccin）」/ `experimental`，应为 themes），
  他们的本地化把 stats line 误读成了用量看板。
- 若要真正上架：提交 `lib/` 构建产物（去掉 `prepare`）+ 去 DSH-Store 提 PR 申请 `user-reviewed`（人工通道），
  并接受对方「高权限项目可能仍需保持 guarded」的判定。

## 下次发版 SOP

发布走 GitHub Actions 的 OIDC **Trusted Publisher** 自动发 npm。正常流程**不要手动 `npm publish`**（手动只是 CI 故障时的紧急回退，见下）。

> ⚠️ **推 tag 前必须先问维护者**：tag 一推就自动发 npm、**撤不回来**（`npm unpublish` 会留下公开痕迹，还可能断掉已安装者的 lockfile）。Agent 可以把准备工作全做完——版本号、CHANGELOG 落节、本地全量验证、release commit——但 `git push origin main --tags` 这一步要等维护者点头。（2026-09-21 教训："继续未完成的工作" 被理解成含发版，于是自行发了 v0.5.5；版本内容没问题，但流程错了。）

### 发布前检查（一次性配置，已就绪但请复核）
- npmjs.com → 包 `@nonamelego/dsh-catppuccin` → Settings → **Trusted Publisher**：Repository 必须为 `dsh-catppuccin-theme`（当前已配好）。若与仓库名不一致，CI 的 `Publish to npm` 步会失败。

### 0. 选版本号（决定发布渠道）
- 正式版（版本号**不含** `-`）：`0.x.y` → 发布后进 `latest` 标签
- 预发布（**含** `-`）：`0.x.y-beta.n` → 发布后进 `beta` 标签
- `publish.yml` 用 `require('./package.json').version.includes('-')` 自动判断 `latest`/`beta`，无需手动指定。

> ⚠️ **发版版本号**：`latest` = **`0.5.9`**（2026-10-02），`beta` = **`0.5.10-beta.1`**（2026-10-04；
> Publish run `37179583576` success，日志 `+ @nonamelego/dsh-catppuccin@0.5.10-beta.1` 带 provenance；CI `37179583423`
> check + boot-e2e 双绿；dist-tags 约 45 s 内生效）。
> **`0.5.10-beta.1`（内容在 CHANGELOG 的 `[Unreleased]`，按仓库惯例预发布不单独落节）= 插件详情页加上设置区**：
> 新增 `src/client/detail-card.tsx` + `plugins.bundle.config` 插槽注册（key = **npm 包名**），把「设置 → 通用」
> 那三条行也挂到插件自己的详情页上；数据层零改动（两个入口共用 `CATPPUCCIN_ENTRY_ID` 那份 section）。
> 机制取证与护栏见「## 插件详情页的设置区」一节。**测试 267 全绿**，三条变异实测会红（key 换成条目 id /
> 去掉 `whileServed` / 卡片里删掉更新行）。⚠️ 真机 e2e **未跑**（本机 Playwright 不可用，属环境限制）。
> 上一版 `beta` = **`0.5.10-beta.0`**（2026-10-03）= 插件卡片图标 + 「检查更新」按宿主分流：
> 前者给仓库根加 `icon.png`（`package.json` 的 `icon` + 进 `files`；Host 读包元数据内联成 data URI，
> 卡片容器 48×48 + 内部 `<img>` 36×36 + `object-fit:contain`）；后者新增 `classifyShell()` 把宿主判成
> `web` / `community-desktop` / `official-desktop`，官方桌面版不再给**无处可跑**的
> `dsh plugin --profile desktop …`，改给 `包名@渠道` + 「插件界面里先删除再重新安装」。**测试 260 全绿**，
> 三条分流支路均变异验证过。⚠️ 真机 e2e **未跑**（本机 Playwright 不可用，属环境限制）。
> 上一版 `beta` = **`0.5.9-beta.1`**（0.5.9 的最后一个预发布，2026-10-01）。
> **`0.5.9`（2026-10-02，当前 latest）= 上游 0.2.0 线适配 + 玻璃模式切换两条修复 + 命令面板毛玻璃**：前两项随 `0.5.9-beta.0`
> （补 18 个漏映射 token 至 190/190 全覆盖、兼容声明跟进 0.2.0、Windows 标题栏顶部渐隐、「切云母/兼容会闪一下」
> 与「切得快时第二次被回滚」），第三项随 `0.5.9-beta.1`（issue #19：composer 的材质搬到 `::before` 材质面，
> 让 `[data-trigger-menu]` 脱离 backdrop root，实测面板区 stdev 31.58 → 0.00）。**转正时与 `0.5.9-beta.1` 零代码差异**，
> 唯一新增改动是 `vitest.config.ts` 的 `hookTimeout: 60_000`（本机满载时 `tests/tui-themes.spec.ts` 的 `afterAll`
> 清临时目录会超默认 10s，把整轮 `pnpm test` 的退出码弄成非零）。⚠️ **issue #19 那条的真机 e2e 未跑**
> （`docs/issue-19-palette-blur.md` §10 列了三条待补）；维护者自测口径 = 敲 `/` 看面板毛玻璃 + 分栏态（右侧栏打开）
> 再敲一次看输入栏内有无位移。上一版 `beta` = **`0.5.7-beta.0`**（2026-09-24 下半场，内容为 `0.5.7` 的真子集：
> **官方桌面壳改用 Electron 运行时识别**——`process.versions.electron`，因为上游明确「`DSH_DESKTOP_NODE_EXECUTABLE`
> 仅为包安装注入」；+5 断言 / 231 用例，单元与 e2e 两条路径都做了变异验证，另附一批文档与仓库卫生修正）。
> **`0.5.8`（2026-09-28，上一版 latest）= issue #17 的三族子串选择器退场**：`[class*='panel']` 与 `[role='tooltip']`
> 从 compat 的三条规则里移除，`[class*='card']` 收窄到 `[data-composer-card]`（离线扫描 `0.1.7-rc.2` 全套客户端包
> 957 个文件里的 **20 个 `*_card` 类名**：18 个自绘 `background` ⇒ blur 被自己的底色盖住、我们的填充等于替换设计 token；
> 2 个无任何 `background` 声明 ⇒ 规则是唯一把它们画出来的东西，正是报告人的灰纹与孤线）。**未采纳**「加 `compatExclude`
> 配置项」（要碰 #15 的双通道 settings seam，还得新开一条样式注入通道）与「行级尺寸豁免」（纯 CSS 没有判据；改走运行时
> 等于在幂等 stamper 里每帧强制布局）。真机 e2e 在 `0.1.7-rc.2` 上 **19/19**。顺带查明**上游与本插件都没有「通用自定义
> CSS」入口**（两版本全套包 + 前端 bundle + profile patch 全 0 命中），README 因此改用「只读取证脚本 + 外部注入 + 提 issue」三步。
> ⚠️ **2026-09-29 报告人更正（issue #17 末条评论）**：上面这条结论的**扫描范围只有 DSH 上游 + 本插件**，别读成「这台机器上没有样式入口」——
> **第三方插件可以自带**：`dsh-better-sidebar@0.21.1` 就有 `customCss` 配置项，gate 在它自己的 `titleBarScheme === 'custom'` 上
> （`const customCss = scheme === "custom" ? snapshot.prefs.customCss : ""`），以 `data-dsh-custom-css` 注入，写在 profile patch 里该插件条目的
> `config:` 下。当时我们在 issue 里据此断言「你们本地的 `customCss` 应该是自制的」是**错的**（已由报告人纠正）。
> **`0.5.7` 在此之上加了 issue #16**：compat 模式不再给 DSH 原生右侧栏的**布局壳**加模糊——`[class*='panel']` 的子串匹配命中 `P3OORG_panel` / `P3OORG_panelBody`（透明布局壳：`absolute + pointer-events:none`、无 `background`，关闭右栏后仍留在 DOM，blur 于是继续绘制成右缘约 300×518 的磨砂残带）；改为排除该容器**整棵子树**（按 `data-sidebar-right-panel`）并用 `data-sidebar-right-open` 回填展开态 ⇒ 打开观感不变。真机 e2e 在 `0.1.7-rc.2` 上 **19/19**（含同页 A/B），影响面审计的差集正好是那两个容器、反向为 **0**。同批还修了 e2e harness 三处会产**假绿**的坑（向导步骤切换脱离 `role=dialog` 且残留 `_mask_*` 吃点击、mode 与总开关的点击静默不生效、浏览器 fallback 到系统 Chrome + `--no-proxy-server`）。
> 上一版 `0.5.6`（2026-09-24 发布：**issue #15 —— DSH 0.1.7 的 settings seam 双通道适配**：客户端 `inject` 去掉 `settingsScope` 硬依赖、两个 seam 各一次软注入由 `DurableScope` 适配、Host 新增 volatile `Config` 并保留 `installSection` 分支、`.volatile()` 加 schemastery 3.18 能力守卫、迁移延迟重试；+23 断言 / 215 用例全绿。**已在本机真机验证通过**——维护者把 DSH Desktop 升到 DSH `0.1.7-rc.1` 后，用该运行时启动 `web` profile 逐项过关（无 pending / 四条设置行 / 点 Mocha 后 patch 落盘 / 重启后从文档 hydrate 回 Mocha），过程与结论见 `docs/issue-15-settings-seam-0.1.7.md` §0.1）；同批还修了两处只在这一批之后才暴露的缺陷——真机跑出来的 `scheduleLegacyMigration` 并发竞态（三次机会之间只挡了 `settled`，第二个尝试在第一个写提交前读到同一 revision，撞栅栏后被记成 `legacy state migration failed`，而迁移其实成功了）与 `web-platform.ts` 平台模块表的漂移，两者都有断言钉住（去掉守卫即变红）。`beta` = **`0.5.6-beta.2`**（0.5.6 的最后一个预发布，内容为其真子集）。上一版 beta.1（2026-09-23）是上游 0.1.7 适配复核（带 alpha 的静态色不再被抹成实心、菜单半透明只在宿主声明 `--dsw-menu-backdrop-filter` 时启用、新增的 `--dsw-alias-link` 暗色达到 AA、文档预览浅色标签不再糊在深底、右侧栏玻璃钩子改指 `data-sidebar-right-panel`；+15 条断言 / 191 用例，5 条经变异验证会红）。beta.0（2026-09-22）是审计 F1~F9 那批修复（跨窗口旋钮同步、读侧陈旧写保护补真、预设组键盘可达、跨窗口关闭风味落地、草稿行 key、重试通道、override 垃圾键收敛等），**它已在两个本地 profile 上装过（`web` 与 `desktop` 均为 `0.5.6-beta.0`**，desktop 用 `~/.dsh/profiles/node_modules/pnpm` 的 11.8.0 装，pnpm 会自动把该版本加进 `minimumReleaseAgeExclude`）；**beta.1 未实测**（beta.2 与 `0.5.6` 已在真机实测通过）。下次按常规 semver 判断：**修复走 `0.5.x`，新特性走 `0.6.0`**；预发布仍用 `-beta.n` 后缀。发版前先在 CHANGELOG.md 的 `## [Unreleased]` 节写好条目、发版时落成 `## [<version>] - <日期>`（publish.yml 校验正式版必须已有对应条目；该节缺失时 `pnpm changelog:gen -- --write` 会自动补建；**预发布按仓库惯例留在 `[Unreleased]` 里，只把该链路的比较基线指到新 tag**）。发布后顺手把这句话的版本号改掉——它已经落后过两次（还写着 0.5.1 时已经发到 0.5.2/0.5.3，写 0.5.3 时已经发到 0.5.4）。

### 1. 升版本 + 本地验证
1. 编辑 `package.json` 的 `version`（连同本次要发布的代码改动）
2. **更新 CHANGELOG.md**：在 `## [Unreleased]` 追加条目，或发版时把草稿生成后润色成 `## [<version>] - <日期>` 节。生成草稿：
   ```bash
   pnpm changelog:gen            # 打印 上一 tag..HEAD 的草稿（按 conventional 分组）
   pnpm changelog:gen -- --write # 直接写入 [Unreleased] 节
   ```
   然后人工润色（补日期、合并条目、删噪音）。**正式版发版前必须已有对应 `## [<version>]` 条目**——publish.yml 的 `Verify changelog entry` 步会拦截缺失（预发布跳过该校验）。
3. 本地自测：`pnpm typecheck && pnpm typecheck:tests && pnpm build && pnpm test`（CI 也会跑同样步骤，但先自查）

### 2. 提交 + 打 tag + 推送（触发发布）
```bash
git add . && git commit -m "chore(release): 发布 v<version> ..."
git tag v<version>            # tag 名 = "v" + package.json 的 version，例如 v0.2.7
git push origin main --tags   # publish.yml 监听 v* tag 推送
```

### 3. 验证发布成功
- GitHub → Actions → `Publish Package` run 应为 `success`（`gh run watch <id> --exit-status` 可以直接等结果）。日志里出现 `+ @nonamelego/dsh-catppuccin@<version>` 就是发出去了（还会带 provenance 签名）。
- **确认版本号时必须绕开仓库的 `.npmrc`**：本仓库的 `.npmrc` 指向 `npmmirror`，所以裸跑的 `npm view` 读的是**镜像**，而镜像滞后没有上限——2026-09-21 发 v0.5.5 时，官方 registry 隔一分钟就有 `latest: 0.5.5`，而镜像过了 4 分钟仍显示 `0.5.4`（上一轮 v0.5.4 记的「约 3.5 分钟延迟」其实也是镜像滞后，不是 npm 的）。验证命令显式带 registry：
  ```bash
  npm view @nonamelego/dsh-catppuccin dist-tags --registry=https://registry.npmjs.org
  ```
  权威信号是 `Publish to npm` 步日志里的 `+ @nonamelego/dsh-catppuccin@<version>`（带 provenance 签名）；`npm notice ... may take a few minutes` 只是 npm 的常规提示，不代表要等。
- `git push` 偶发 GitHub **502**，直接重试即可（不要改 remote、不要 `--force`）。

### 4. 发布后
- **⚠️ 刚发完版，自己（或用户）立刻去装会发现「装到的是上一个版本」——这不是没发出去，是 pnpm 11 的
  `minimumReleaseAge`。** 2026-10-03 实测：pnpm 11.7.0 的配置 schema 里内置
  `"minimum-release-age": 24 * 60`（**= 24 小时**，`pnpm config get` 查不到，因为它来自默认值而非配置），
  `pnpm add <pkg>@beta` 会把窗口内的新版本**静默过滤**掉、解析到**上一个**符合窗口的版本
  （实测 `@beta` → 装到 `0.5.9-beta.1`，而镜像元数据里 `beta` 明明是 `0.5.10-beta.0`），
  而插件界面自己查 tag 得到的是新版本 ⇒ **界面显示新版本、实际装的是旧版本**（本次的症状就是
  「0.5.10-beta.0 装上了但卡片没有图标」，因为旧版本没有 `icon` 字段）。
  三条出路：① **指名精确版本**（`@nonamelego/dsh-catppuccin@0.5.10-beta.0`）——pnpm 会自动把该版本写进
  profile 的 `minimumReleaseAgeExclude`；② 在该 profile 的 `pnpm-workspace.yaml` 里给本包**整包豁免**
  （`minimumReleaseAgeExclude:` + `  - '@nonamelego/dsh-catppuccin'`，本次已给
  `~/.dsh/profiles/desktop` 加上，之后每个 beta 都能立刻装）；③ 等发布满 24 小时。
  诊断口诀：**先看 lockfile 的 `specifier:` 与已装 `package.json` 的版本，再看 `pnpm view <pkg>@<tag>`**——
  两者不一致就是撞上了这个窗口，别去查「是不是没发出去」。
- **把上面 `> ⚠️ 发版版本号` 那句的版本号改掉**（历史：写 0.5.1 时已到 0.5.2/0.5.3、写 0.5.3 时已到 0.5.4 —— 所以把它当成发版流程的最后一步，别指望“下次顺手”）。
- **CHANGELOG 底部的链接引用**也要顺手维护：`[Unreleased]` 指向新 tag（`compare/v<new>...HEAD`），并给新版本补一行 `[<version>]: compare/v<prev>...v<new>`。上个版本漏了，导致它停在 `v0.5.1...HEAD`。
- 若插件已收录于 awesome-dsh-plugin，收录条目无需随发版改动。
- 正式版发完如 README 需要同步变化点，并入本次 release commit。

## 故障排查（发版失败）

**背景**：`Publish to npm` 步骤历史上**连续失败多次**（v0.1.2 ~ v0.2.5），而 `0.2.6` / `0.2.6-beta.0` 是绕过 CI、本地手动 `npm publish` 发出的——原因是 Trusted Publisher 的 Repository 与（改名前的）仓库名不匹配。改名并同步配置后，下次发版是 CI 通道的首次验证点。

- 失败在 **pnpm/action-setup** 步（`Multiple versions of pnpm specified`）→ workflow 的 `version` 与 `package.json` 的 `packageManager` **字符串必须完全相等**，否则 action 直接抛错。本仓库只保留 `packageManager`（workflow 不传 `version`，官方推荐用法）——2026-09-15 加 `packageManager` 时踩过一次，差点让发版在第二步失败。
- 失败在 **Typecheck** 步、本地却过（`TS2307: Cannot find module '@deepseek-ai/...'`）→ **本地过 ≠ CI 过**：TS 会向上逐层查找 `node_modules`，本仓库位于 `D:\Vibe-Coding` 下，父目录的 `node_modules` 里有什么就能解析什么（幽灵依赖）。未声明的 `@deepseek-ai/*` 类型包必须写进 `devDependencies`；拿不准时把仓库复制到**工作区之外**（如 `%TEMP%`）跑一遍 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm typecheck:tests && pnpm test`——2026-09-15 的 `@deepseek-ai/dsh-api-remotes` 就是这样被 CI 抓到的。

- 失败在 **install / build / test** 步 → 本地构建问题，先在本地重跑 `pnpm install && pnpm build && pnpm test`。
- 只失败在 **Publish to npm** 步：
  1. 首选怀疑 **Trusted Publisher 与仓库名不匹配** → npmjs 网页确认 Repository = `dsh-catppuccin-theme`。
  2. 打开该 run 的日志，看 `npm publish` 的具体报错（`errCode` / 401 / 403 / E401 等）。
- **紧急回退**（确信 CI 短时间修不好时）：本地手动发，必须显式走 npmjs registry——仓库 `.npmrc` 指向 npmmirror，直接 `npm publish` 会发错仓库/失败：
  ```bash
  npm publish --registry=https://registry.npmjs.org --tag latest   # 正式版
  npm publish --registry=https://registry.npmjs.org --tag beta     # 预发布
  ```

## 其它项目约定
- 提交信息用中文 conventional 风格：`feat(...)` / `fix(...)` / `chore(release): ...` 等。
- **CHANGELOG 双语**：希望 changelog 条目附带英文摘要时，在 commit 正文里写一行 `EN: <英文摘要>`（大小写不敏感）；`pnpm changelog:gen` 会自动把它渲染为 `- **中文标题**（EN: 英文）`。没有 `EN:` 行的 commit 只输出中文——双语是可选增强，不强制每条都要写英文。
- 玻璃质感（玻璃拟态）皮肤代码在 `src/client/glass/`；主题调色板由 `pnpm gen:palettes` 生成（`scripts/generate-palettes.mjs`）。
- dsh-TUI 主题文件在 `themes/`（四个风味各一个 `~/.dsh-tui/themes/` 用 JSON），由 `pnpm gen:themes` 生成（`scripts/generate-tui-themes.mjs`，读同一份官方色板缓存）；改键映射后重跑并核对 dsh-TUI `src/theme.ts` 的 Theme 键。
- TUI 安装入口是 `src/tui-themes.ts`（子路径导出 `./tui-themes`，cordis.patch.yml 第二行）：激活时幂等同步主题到 `~/.dsh-tui/themes/`；dsh-TUI 没有主题注册 API，目录是唯一接缝，`catppuccin-*.json` 命名空间归本插件所有、同步即覆盖。
- 插件预览图（README 专用，存在 `assets/previews/`）：`scripts/screenshot-previews.cjs` 出四风味图、`scripts/screenshot-glass.cjs` 出玻璃图、`scripts/combine-previews.py` 合成斜切大图（输出 `combined.png` / `glass-combined.png`，`hero-mocha.png` 是中间产物、已入 `.gitignore`）。三者都要求本地 GUI 跑在 `http://127.0.0.1:3080`；`screenshot-previews.cjs` 已修好并端到端跑通（2026-09-18/21），但**必须把 `dsh web` 打印的 token 传进去**：`node scripts/screenshot-previews.cjs <token>`。不带 token 时 bare origin 回 401 空白页，脚本会以 `openSettings` 90s 超时的形式失败——这是它长期卡住的真因（其余两个：行标题 `?` 徽标让 exact 文本匹配恒为 0；弹窗内「跟随系统」有两处）。**每张风味图都在关闭设置弹窗后拍**：弹窗遮罩会把整页压暗（实测侧栏读成 `182,183,186` 而非 Latte 的 `239,241,245`），脚本会断言弹窗确已关闭，否则直接报错而不是交出一张暗图；出图后跑一遍 `combine-previews.py` 同步 `combined.png`。
- **`assets/` 不进 npm 包**（`package.json` 的 `files` 不含它，图片只在 README 用），所以 README 里的图片一律写**绝对** `raw.githubusercontent.com` URL——别改回相对路径，否则 npm 页面会失去图。
- 对外 API 文档：`pnpm docs:api`（typedoc）→ `docs/api/`。**该目录不入库**（已 `git rm --cached` + 进 `.gitignore`，见 WW），本地按需生成即可；生成物当前是旧的（本次已重生成，但以后只在需要时重建）。重跑时 typedoc 会打一条 `origin` remote "not valid" 的警告——**实测是虚警**：链接照样生成，且指向当前 commit 的 permalink（`blob/<sha>/src/...`），无需改配置。真要自己写模板就用 `disableGit` + `sourceLinkTemplate`，注意 `{path}` **不含 `src/` 前缀**（否则生成 404 链接）。
- `src/profile-detect.ts`：更新检查里「自动探测当前 profile 名」的实现（探测失败回退 `web`）。
- CI 配置：`.github/workflows/ci.yml`（push main / PR，只读权限）——两个 job：`check`（install + typecheck + build + test）与 `boot-e2e`（**启动级 e2e**，见下一条；独立 job 是因为它要装宿主 + 下载 Chromium，且与 `check` 并行，实测 +54~73 s）；发布另有 `.github/workflows/publish.yml`（`v*` tag / 手动 dispatch，OIDC 可信发布，无 token 入库）。**普通提交只靠 ci.yml 把关**——发布链路里才跑检查的旧格局已经让两次发版失败（幽灵类型依赖、跨测试污染）。
- **启动级 e2e**：`scripts/e2e-boot-check.cjs`（**在仓库里**，不是本机探针目录）。做法：临时 `DSH_HOME` → `dsh plugin --profile web add link:<repo>` → `dsh web --no-open --port 0`（token 在 stdout）→ 走掉宿主首次运行引导（2 步：内测声明「继续」、API Key「稍后配置」）→ 打开设置断言行/风味/玻璃开关，并采样**级联后**的关键计算样式（侧栏玻璃片不得有 `backdrop-filter`、composer 卡必须保留、compat 下浮动面有 rim 而 `panel` 不被描边、**issue #16：右侧栏容器关闭态不得有 blur**——真会话下查宿主渲染出来的 `[data-sidebar-right-panel]`，新 `DSH_HOME` 无会话时跳过；另有**不依赖会话**的合成 markup 版本，往真页里塞一份 `P3OORG_panel` + `P3OORG_panelBody` 读计算样式，真 Chromium 真样式表，带「容器外的同名类仍必须被模糊」的对照组）。本地跑法：`pnpm build` 后 `NODE_PATH="$APPDATA/npm/node_modules/@playwright/cli/node_modules" node scripts/e2e-boot-check.cjs`（想验证某个具体 DSH 版本就加 `DSH_BIN=<该版本>/node_modules/@deepseek-ai/dsh/lib/bin.js`）。**刻意不做整图 diff**（理由与方案取舍见 `docs/plugin-improvements.md` §3.9）。已知边界：新 `DSH_HOME` 没有工作区/会话 ⇒ PP 选中行采样**会跳过并打印 skipped**（不会假绿）；改过视觉后仍应手动重出四风味预览（上一条）。**2026-09-27 在 `0.1.7-rc.2` 上实测的三个坑都已在脚本里修掉**（别再改回去）：① 首次运行向导是多包拼的多步流程，**步骤切换的间隙整棵子树会短暂脱离 `role=dialog[aria-modal]`**，只看 dialog 会在第一步「继续」后就收工，之后每次点击都被残留的 `_mask_*` 遮罩拦下（30s 超时）⇒ 找不到 dialog 时按按钮文案在全页找、并轮询到遮罩消失；② **「兼容模式」那一次点击会静默不生效**，于是它下面所有 compat 断言都在「compat 其实没开」的状态下取样（rim 找不到 / `panel` 没描边 / 右侧栏没 blur 一起假绿）⇒ 必须轮询到 html 真挂上 `data-dsh-glass-compat` 再往下，并把这个切换本身也断出来；③ 本机 `%LOCALAPPDATA%\ms-playwright` 被清空时退到**系统 Chrome** 并加 `--no-proxy-server`（本机沙箱的 `HTTP_PROXY` 会吃掉 localhost）。另外：临时 `DSH_HOME` **可能会自动建出一个默认会话**（本机 rc.2 实测有），所以右侧栏那条真机断言不一定跳过——它跳过时说 skipped，跑到了就给出真数字。
- **「已实现」≠「接线正确」（2026-09-22 审计教训）**：那轮两个 P1——跨窗口旋钮不同步、读侧陈旧写保护恒不成立——都通过了类型检查与当时全部 158 条用例，因为缺陷恰好落在**没有事件穿过的分支**（`event.key in NUMERIC_KEYS` 判的是属性名）和**时序假设**（两次 `getSnapshot()` 在同一同步块）上，只读代码看不出来。改交互/持久化代码时补两类测试：**接线测试**（每个 `if`/`switch` 分支至少被一个真实事件穿过——例：`tests/glass-layer.spec.ts` 把 `storage` 处理器的每个分支各走一遍）与**时序测试**（用可注入的 revision 模拟「防抖窗口内先被外部改过」——例：`createBaseRevisionTracker` 的用例）。修 bug 时**默认用变异测试证明新断言会红**（改回旧写法跑一遍），完整清单见 `docs/code-audit-2026-09-22.md`。
- 本机 `bash` 环境缺 coreutils（`ls`/`sed`/`grep`/`sleep` 都可能 not found），要跑脚本请走 PowerShell 工具或 `node -e`；`git` / `gh` 可用。**`rm` 也被 shim 拦**：删文件用 `node -e "require('node:fs').unlinkSync('x')"`。

## 与报告人协作（issue / 评论 / 关闭）

- **对外发言必须先经维护者同意**：issue 评论、关闭、任何公开文字都先问（用户明确要求过两次）。内部动作（读、改代码、本地测量）不必问。
- **评论里每个数字都要可复核**（实测值 + 口径），并且写成「**预期 + 依据 + 不达标怎么办**」三段式；不要承诺没有证据的效果。已发布 ≠ 已验收。
- **关闭时写明重开条件与下一手**。症状若是「收益 / 占用」这类只有报告人硬件能测的东西，先例（#13）是：写清已修内容 + 代理证据 + 「若不降请重开，我立刻上批次 B（退顶栏 `-95px` 自造重叠）」。不要为了看板干净而提前关。（**后续**：2026-09-21 维护者判断无需复测，批次 B 也随之不排期——该先例本身仍成立，只是这一单的下一手被主动放弃了。）
- **审报告人的判据**：先分清他给的每个读数能证明什么。先例（#12）：白底 `#fff` **不能**证明「当时用的是官方主题」——本插件亮度旋钮 100 也给白底（`--dsh-glass-brightness-white: 1`）；能当判据的只有**文字 token**（官方 caption `173,178,184` / secondary `97,102,107` vs Latte `#7c7f93` / `#5c5f77`）。
- 报告的机制推断**逐条核对**后再回：本轮 #13 的两处表格错（边缘渐变条、composer 卡片都不是 mica 独有）就是这样查出来的——**自己代码注释里的同类说法也要一起改**。

## 本机测量资产（真页 A/B 与面积账）

### 真机验证某个具体 DSH 版本（2026-09-24 打通，issue #15 用过）

社区桌面壳（`D:\PROGRAM\DSH`）**不自带 DSH**：它按版本把运行时下到
`%APPDATA%\DSH\data\versions\<ver>\node_modules\@deepseek-ai\`（该目录**自带整套 0.1.7 包 + schemastery 3.18.4**），
`%APPDATA%\DSH\data\config.json` 的 `versions` 列出已装版本。所以「验证 0.1.7」不需要动全局 CLI（那里还是 0.1.5-rc.2）：

```bash
V="C:/Users/LeGo/AppData/Roaming/DSH/data/versions/0.1.7-rc.1/node_modules/@deepseek-ai/dsh/lib/bin.js"
node "$V" --version                                              # 0.1.7-rc.1
node "$V" plugin --profile web add @nonamelego/dsh-catppuccin@beta
node "$V" --profile web --no-open --port 19411                   # 前台跑，token 在 stdout 的 URL 里
```

- **host 侧**：插件 host 半区日志只走 stdout（`console.info/warn`），直接在启动日志里 grep。
- **client 侧**（`pending (waiting for service: …)` 这类）**只在浏览器控制台**，stdout 看不到 ⇒ 必须起页面。
- 起页面：Playwright + **系统 Chrome**（`C:/Program Files/Google/Chrome/Application/chrome.exe`，无需下载浏览器），
  `NODE_PATH="$APPDATA/npm/node_modules/@playwright/cli/node_modules"`，**必须加 `args:['--no-proxy-server']`**
  ——本机沙箱有 `HTTP_PROXY=127.0.0.1:1793`，localhost 请求会被代理吃掉（报 502/连接被拒）。
- ⚠️ **别用 `(node ... &)` 起宿主**：Bash 调用结束时进程会被清掉，日志为空。要长期存活就用后台任务方式起（前台 node 包在后台任务里）。
- 落盘位置（0.1.7 新 seam）＝ `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里该条目的 `config:`
  ——改一个旋钮后 `grep -A13 'id: dsh-catppuccin'` 就能确认写通。

- **配置真源**（版本相关，issue #15 起）：**≤ 0.1.6-alpha.2** 是 `~/.dsh/settings.yaml` 的 `catppuccin:` 段（插件 `installSection` 注册的命名空间）；**≥ 0.1.7-alpha.1** 改成 profile patch `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里 `dsh-catppuccin` 条目的 `config:`，即插件 volatile `Config` 表单，Client 用 `ctx.configForms.get('dsh-catppuccin')` 读写——表单 ns **就是 profile 条目 id**，与 `cordis.patch.yml` 的 insert id 是硬契约（`CATPPUCCIN_ENTRY_ID`，有断言钉住）。两套 seam 由 `src/client/state-sync.ts` 的通道适配层同时支持，**任何一侧都不能写进硬依赖 `inject`**（写进去会在另一侧永久 pending，这就是 #15 的现象）。`~/.dsh/catppuccin-state.json` 自 0.5.0 起只是**一次性迁移源、此后不再跟踪**（2026-09-24 复核：该文件与 `settings.yaml.imported` 的 `glass.brightness` **都是 `50`**，与 `DEFAULT_GLASS.brightness` 一致——早先记的「真值 100」自 9-21 起已不成立；引用旧文件仍会误导，因为它不含 `updateChannel` / `shikiStyle` 等后加字段）——引用旧文件会把玻璃参数写错。方案与实测判定见 `docs/issue-15-settings-seam-0.1.7.md`。
- **起 GUI**：`node <npm>/node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open`（**token 在 `dsh web` 的 stdout**——`%TEMP%\dsh-web.log` 会过期，引用它会让浏览器/探针打开一个 401 空白页；`dsh web` 默认会弹浏览器，加 `--no-open`）。
- **探针目录**（**未入库**；原在 `D:\Vibe-Coding\.cache\glass-blur-probes\`，**2026-09-24 复核：已随缓存清理丢失**，需要再做测量时按下列用途重建）：`area.cjs`（面积账：4px 栅格取**可见面积并集** + compat 选择器模拟）、`uniform.cjs`（判定「填充变了」还是「文字重栅格化」）、`diag2.cjs`（稳定性 / 合成栈 / 注入是否生效）、`bubble.cjs`、`real.cjs`、`probe12.cjs`、`probe-ground.cjs`、`gpuverify.cjs`（负结果）。入库的同类证据只剩 `.debug/compat-probe.mjs`（交叉版本 seam 探针，8 组判定）与 `.debug/probe-017.cjs`（真机 0.1.7 探针）。
- **跑法**：`NODE_PATH="$APPDATA/npm/node_modules/@playwright/cli/node_modules" node <x>.cjs <token>`——必须 `.cjs` / `require`（`NODE_PATH` 只对 CJS 生效），Chromium 显式给 `executablePath = %LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe`。
- **三条硬要求**：① **噪声底线先收敛**（轮询到两张连续截图完全一致再测；首轮 UNSTABLE 时的数字不可引用，本轮首轮 2.79% 就这么来的）；② **A/B 双向显式注入**并核对 `getComputedStyle` 实际值（本机装的可能还是旧版，只注入一侧等于测空气）；③ **控制项必须 DIFFERS**（把地面换成高对比条纹，差异必须巨大），否则全零的 A/B 什么都没证明。
- **已知无效方向，别再花时间**：**「占用率」不能靠 trace 的时间自证**——headful + CDP trace（`devtools.timeline,cc,gpu`）在 6s 滚动负载下 blur 开/关的 composite 时间差落在噪声里（3178 vs 3254 ms，同配置漂移 50 ms），负载已把合成管线压满；报告人测的占用率在本机不可复现。（另：`Tracing.start` 后必须 `Tracing.end`，否则 `tracingComplete` 不触发、下一次 start 会报 "already been started"。）
