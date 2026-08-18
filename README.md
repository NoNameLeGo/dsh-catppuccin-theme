<h3 align="center">
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/logos/exports/1544x1544_circle.png" width="100" alt="Logo"/><br/>
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
	Catppuccin for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
</h3>

<p align="center">
	<a href="https://github.com/NoNameLeGo/dsh-catppuccin-theme/stargazers"><img src="https://img.shields.io/github/stars/NoNameLeGo/dsh-catppuccin-theme?colorA=363a4f&colorB=b7bdf8&style=for-the-badge"></a>
	<a href="https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues"><img src="https://img.shields.io/github/issues/NoNameLeGo/dsh-catppuccin-theme?colorA=363a4f&colorB=f5a97f&style=for-the-badge"></a>
	<a href="https://github.com/NoNameLeGo/dsh-catppuccin-theme/contributors"><img src="https://img.shields.io/github/contributors/NoNameLeGo/dsh-catppuccin-theme?colorA=363a4f&colorB=a6da95&style=for-the-badge"></a>
</p>

<p align="center">
	<img src="assets/previews/combined.png" width="100%" alt="Catppuccin 四主题下的 DeepSeek Harness"/>
</p>

## 简介

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI
（`dsh web`）的 [Catppuccin](https://github.com/catppuccin/catppuccin) 主题插件。

它内置 Catppuccin 的四个主题——**Latte**、**Frappé**、**Macchiato**、**Mocha**——
把整个界面的配色都换成对应的 Catppuccin 色板；并在 **设置 → 常规 → 外观**
下方提供一行 **Catppuccin** 快捷切换，选择会自动保存、重启自动恢复——
偏好持久保存在 DSH home 下的 `catppuccin-state.json`（浏览器 localStorage
作为同机的即时缓存），因此即使在 **DSH Desktop** 里每次启动端口都变化，
主题和玻璃设置也能跨重启稳定恢复。

同时内置一套可开关的**玻璃质感**（Glassmorphism）皮肤：顶栏、侧边栏、
输入框、统计行、轨迹视图、聊天气泡、新会话按钮都变成磨砂玻璃卡片，
模糊度、磨砂度、背景亮度均可自由调节，玻璃颜色自动跟随当前
Catppuccin 主题。

## 特性

- 🎨 四个主题：Latte（浅色）、Frappé / Macchiato / Mocha（深色）
- 🧩 接入官方主题系统，与内置浅色 / 深色 / 跟随系统主题平级
- 🎯 全界面配色覆盖（162 个配色变量），不只是一两个强调色
- ⚙️ 设置页一行切换，选择自动保存、重启自动恢复
- 🌐 中英文双语文案（跟随系统语言）
- 🪟 **玻璃质感**：顶栏 / 侧边栏 / 输入框 / 统计行 / 轨迹视图 / 聊天气泡 /
  新会话按钮磨砂玻璃效果，设置里一键开关；云母 / 兼容双模式，模糊度、磨砂度、
  背景亮度自由调节（交互参考 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)）
- 🌫️ **玻璃拟态细节**：页面上下边缘渐变模糊、折叠侧边栏悬浮玻璃、
  纯色背景跟随主题底色——内容滚入视口边缘时柔化穿过，层次更立体
- 🎨 玻璃配色取自当前主题的 token（color-mix 自动跟随四个 Catppuccin 色板）
- 🔄 **检查 Catppuccin 插件更新**：设置页一键检测本插件（dsh-catppuccin）在 npm 上的最新版本，发现新版直接给出可复制的升级命令

## 预览

四个主题在 DeepSeek Harness 中的实际效果（截图来自本地 GUI，文首大图为四主题斜切合成）：

<details>
<summary>🌻 Latte（浅色）</summary>
<img src="assets/previews/latte.png"/>
</details>
<details>
<summary>🪴 Frappé（深色）</summary>
<img src="assets/previews/frappe.png"/>
</details>
<details>
<summary>🌺 Macchiato（深色）</summary>
<img src="assets/previews/macchiato.png"/>
</details>
<details>
<summary>🌿 Mocha（深色）</summary>
<img src="assets/previews/mocha.png"/>
</details>

### 玻璃质感（Mica 云母模式）

同一会话在浅色（Latte）与深色（Mocha）下的磨砂玻璃效果：顶栏、侧边栏、
聊天气泡、输入框与统计行都是玻璃卡片，消息滚过页面边缘时被柔化，
背景为主题底色的纯色（截图来自本地 GUI）：

<p align="center">
	<img src="assets/previews/glass-latte.png" width="100%" alt="玻璃质感 · Latte"/>
	<br/><br/>
	<img src="assets/previews/glass-mocha.png" width="100%" alt="玻璃质感 · Mocha"/>
</p>

## 安装

### 方式一：从 npm 安装（推荐）

```sh
dsh plugin --profile web add @nonamelego/dsh-catppuccin
```

装完重启 `dsh web` 即可，`dsh plugin` 会自动把它加进 profile 的 bundles。
其他 profile 把命令里的 `web` 换成对应名字即可（如 `headless`）。

**[DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)**：桌面版默认激活的 profile 就叫 `desktop`，把命令里的 `web`
换成 `desktop` 即可：

```sh
dsh plugin --profile desktop add @nonamelego/dsh-catppuccin
```

在桌面的 **DSH 终端**里运行即可（终端里的 `dsh plugin` 默认就作用于当前激活的
profile，也可以直接写 `dsh plugin add @nonamelego/dsh-catppuccin`；若你在托盘里
选了别的 profile，就把 `desktop` 换成那个名字），装完重启 **[DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)** 生效。
从仓库安装的方式同理：`dsh plugin --profile desktop add https://github.com/NoNameLeGo/dsh-catppuccin-theme`。

### 方式二：从仓库安装

```sh
dsh plugin --profile web add https://github.com/NoNameLeGo/dsh-catppuccin-theme
```

从 git 安装时 pnpm 可能要求允许构建脚本——按 pnpm 的提示把对应包加进 profile
`pnpm-workspace.yaml` 的 `allowBuilds` 后重跑一次即可。

### 方式三：本地链接（开发调试用）

克隆到本地后，把包链接进 profile 并加入 bundles（下面的路径换成你自己的）：

```sh
pnpm --dir C:\Users\LeGo\.dsh\profiles\web add link:D:\Vibe-Coding\dsh-catppuccin
```

然后在 profile 的 `package.json` 中把 `@nonamelego/dsh-catppuccin` 加进 `dsh.profile.bundles`，
重启 `dsh web` 即可。在 [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 中使用时，把上面的路径换成桌面 profile
（默认 `desktop`，位于 `~/.dsh/profiles/desktop`），装完重启 **[DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)** 即可。

## 使用

1. 打开 Web GUI（默认 `http://127.0.0.1:3080`）；在 [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 中则直接打开桌面应用即可。
2. 进入 **设置 → 常规**。
3. 在 **外观** 区域下方找到 **Catppuccin** 行，选择主题：
   **Latte**（浅色）、**Frappé**、**Macchiato** 或 **Mocha**（深色）。
4. 选择 **跟随系统** 则回退到官方主题。

### 玻璃质感

在 **设置 → 常规** 的 **Catppuccin 主题** 正下方找到 **玻璃质感** 行：

- **总开关**：开启后顶栏、侧边栏、输入框、统计行、轨迹视图变为磨砂玻璃；
  关闭即完全还原原生界面（无需刷新）。
- **模式**：**云母效果**把界面改成悬浮磨砂卡片；**兼容模式**保持原版排版，
  只把材质换成玻璃。
- **玻璃模糊度**（0–40 px）、**磨砂度**（0–100%）：控制玻璃的模糊半径与
  不透明度。
- **背景亮度**：深色模式 0–50 压暗、浅色模式 50–100 提亮（50 为原样），
  直接调和进纯色背景。

玻璃配色取自当前主题的设计 token，切换 Latte / Frappé / Macchiato / Mocha
时玻璃颜色自动跟随；设置最终持久保存在 DSH home 下的
`catppuccin-state.json`（同主题一起，跨重启、跨端口恢复），浏览器
localStorage 只作为即时缓存与多标签页同步——**DSH Desktop** 每次启动使用
不同的随机回环端口，localStorage 因此无法跨重启保留，而 DSH home 下的文件
不受端口影响，重启后自动恢复。

### 检查 Catppuccin 插件更新

在 **设置 → 常规** 的 **玻璃质感** 正下方找到 **检查 Catppuccin 插件更新** 行：

- 点击 **检查更新**，插件宿主会查询 npm registry 上本插件（`dsh-catppuccin`）
  的最新版本，并与当前安装版本比较（含预发布版本的语义化版本比较）。
- 已是最新 → 显示当前版本号；发现新版 → 显示新版本号，并给出可复制的
  升级命令。命令中的 profile 名由宿主**自动探测**：优先取当前进程的
  `--profile` 参数，否则扫描 `~/.dsh/profiles/*` 找到实际安装了本插件的
  profile，无需手动替换（探测失败时才回退为 `web` 并提示手动确认）。
- 检测到本插件为本地链接 / 源码安装（`link:` / `file:` / git）时会给出
  提示：npm 升级命令不适用，应改用 `git pull` 或重新构建。
- 通道策略：正式版安装只跟随 `latest` 标签；预发布版安装同时跟随
  `beta` 标签（升级命令自动用 `@beta`），正式版超过你的预发布版本时提示
  升级到 `@latest`。
- 检查走宿主进程的 Node fetch（无跨域问题）；离线或 registry 不可达时
  显示具体失败原因并支持重试。
- **环境自适配**：在 [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 中运行时，目标 profile 直接取桌面版的
  当前 profile（不靠扫描猜测），提示与重启文案也切换为 Desktop 口径
  （DSH 终端）；普通 dsh web / CLI 下保持原有终端命令。

## 玻璃拟态（Glassmorphism）

**玻璃拟态**是一种视觉风格：让界面面板像一片磨砂玻璃，透过它能看到背后的
内容。它的三个关键要素是——

1. **半透明填充**：面板本身不画实底色，而是半透明的「玻璃」；
2. **背景模糊**（`backdrop-filter: blur()`）：面板背后的内容（聊天记录、
   页面底色）透过玻璃被柔化，与前景文字拉开层次；
3. **玻璃细节**：细描边、内高光、柔和投影和较大圆角，模拟玻璃的厚度与边缘。

本插件的实现方式：

- **配色自动跟随主题**：玻璃填充用 `color-mix()` 把当前主题的 token
  （`--dsw-alias-bg-layer-1/2`）按磨砂度混合成半透明色，所以 Latte 是浅色
  玻璃、Mocha 是深色玻璃，切换主题玻璃颜色即时跟随，无需额外配置；
- **七个区域玻璃化**：顶栏、侧边栏、输入框、统计行、轨迹视图、聊天气泡
  和新会话按钮都变成磨砂玻璃；云母模式下它们成为带圆角的悬浮卡片，聊天
  内容滚动时会从顶栏玻璃下方穿过、被模糊；折叠侧边栏时导航条同样以悬浮
  玻璃浮在聊天区边缘；
- **页面边缘渐变模糊**：视口上下各有一条渐变模糊带，消息滚到边缘时被
  柔化穿过——玻璃卡片保持清晰，内容在边界「融化」（借鉴
  [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)
  的 Aqua 皮肤）；
- **纯色背景**：页面底色就是当前主题的 `bg-base` 纯色（Latte `#eff1f5` /
  Frappé `#303446` / Macchiato `#24273a` / Mocha `#1e1e2e`），零硬编码、
  切色板自动跟随；背景亮度旋钮直接往这个纯色里调和白/黑；
- **一键开关**：整个效果由 `data-dsh-glass` 属性统一门控，关闭即完全还原
  原生界面，插件卸载时不留任何残留；无心智负担的 z-index 层级整理（侧边栏
  9 / 顶栏与输入框 8）保证设置面板、浮动卡片互不遮挡；
- 交互与实现思路参考了
  [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)
  （Aqua 玻璃皮肤）的云母 / 兼容双模式与旋钮设计。

## 开发

```sh
pnpm install
pnpm typecheck   # tsc --noEmit 类型检查
pnpm test        # vitest 跑配色表覆盖测试
pnpm build       # tsdown 构建 -> lib/index.js（服务端）+ lib/client.js（浏览器）
```

配色表由生成器脚本产出——修改 `scripts/generate-palettes.mjs` 后重跑：

```sh
node scripts/generate-palettes.mjs
```

## 🙋 常见问题

- Q: **_"为什么外观行里看不到 Catppuccin 主题？"_**\
  A: 官方外观行只列出内置的浅色/深色/跟随系统偏好。四个主题在它正下方的
  **Catppuccin** 行里。
- Q: **_"我的主题选择是怎么记住的？"_**
  A: 选择持久保存在 DSH home 下的 `catppuccin-state.json`（同一台机器的
  DSH 共享这份偏好），浏览器 localStorage 作为即时缓存与多标签页同步。
  因此普通 `dsh web`、`dsh web --port` 自定义端口，以及 **DSH Desktop**
  （每次启动用随机回环端口）都能跨重启自动恢复；玻璃质感开关与各旋钮同样
  持久保存。
- Q: **_"怎么知道这个插件有没有新版本？"_**
  A: 设置 → 常规 → **检查 Catppuccin 插件更新** 一键检测本插件在 npm 上的最新版本，
  发现新版会给出可复制的升级命令；也可以随时手动执行
  `dsh plugin --profile web update @nonamelego/dsh-catppuccin`
  （或重新 `add` 最新版）。在 [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 中，把 `web` 换成 `desktop`
  （`dsh plugin --profile desktop update @nonamelego/dsh-catppuccin`），
  或者直接在 DSH 终端里运行 `dsh plugin update`（默认作用于当前 profile）。

## 💝 致谢

- [Catppuccin](https://github.com/catppuccin) 提供的色板与 port 模板
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件体系
- [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)
  的玻璃质感交互与实现参考（云母 / 兼容双模式、模糊度 / 磨砂度等旋钮设计）

&nbsp;

<p align="center">
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" />
</p>

<p align="center">
	Copyright &copy; 2021-present <a href="https://github.com/catppuccin" target="_blank">Catppuccin Org</a>
</p>

<p align="center">
	<a href="https://github.com/catppuccin/catppuccin/blob/main/LICENSE"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>
