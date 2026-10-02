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
	<a href="https://www.npmjs.com/package/@nonamelego/dsh-catppuccin"><img src="https://img.shields.io/npm/v/@nonamelego/dsh-catppuccin?colorA=363a4f&colorB=a6da95&style=for-the-badge"></a>
	<a href="https://www.npmjs.com/package/@nonamelego/dsh-catppuccin"><img src="https://img.shields.io/npm/dt/@nonamelego/dsh-catppuccin?colorA=363a4f&colorB=f5a97f&style=for-the-badge"></a>
</p>

**中文** | [English](README.en.md)

## 目录

- [简介](#简介)
- [特性](#特性)
- [预览](#预览)
- [安装](#安装)
- [使用](#使用)
- [玻璃拟态（Glassmorphism）](#玻璃拟态glassmorphism)
- [兼容性、权限与失败边界](#兼容性权限与失败边界)
- [开发](#开发)
- [🙋 常见问题](#常见问题)
- [💝 致谢](#致谢)

<p align="center">
	<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/combined.png" width="100%" alt="Catppuccin 四主题下的 DeepSeek Harness"/>
	<br/><br/>
	<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/glass-combined.png" width="100%" alt="玻璃质感 · Latte & Mocha"/>
</p>

## 简介

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的
[Catppuccin](https://github.com/catppuccin/catppuccin) 主题插件——一个包同时适配
**Web GUI**（`dsh web`）、**桌面版**（官方 Electron 壳 `apps/desktop` 与社区 DSH Desktop，
共用 `desktop` profile）与 **dsh-TUI** 终端：Web / 桌面端做全界面换色与玻璃质感，
TUI 端自动同步四套官方主题色板。

它内置 Catppuccin 的四个主题——**Latte**、**Frappé**、**Macchiato**、**Mocha**——
把整个界面的配色都换成对应的 Catppuccin 色板；并在 **设置 → 常规 → 外观**
下方提供一行 **Catppuccin** 快捷切换，选择会自动保存、重启自动恢复。

同时内置一套可开关的**玻璃质感**（Glassmorphism）皮肤：顶栏、侧边栏、
输入框、统计行、轨迹视图、聊天气泡、新会话按钮都变成磨砂玻璃卡片，
模糊度、磨砂度、背景亮度均可自由调节，玻璃颜色自动跟随当前
Catppuccin 主题。

## 特性

- 🎨 四个主题：Latte（浅色）、Frappé / Macchiato / Mocha（深色）
- 🧩 接入官方主题系统，与内置浅色 / 深色 / 跟随系统主题平级
- 🎯 全界面配色覆盖，不只是一两个强调色
- ⚙️ 设置页一行切换，选择自动保存、重启自动恢复
- 🔧 **自定义 token 覆盖**：按「`--dsw-* 变量: 值`」逐条覆盖单个配色 token（例如把注释色换成蓝色），与所选风味一起持久保存
- 🖍️ **代码块高亮风格**：默认 / 注释斜体（italic-comments）两套 shiki 风格可选
- 🌐 中 / 英 / 日 / 韩 / 西 / 法 / 德七语文案（跟随系统语言）
- 🪟 **玻璃质感**（云母模式）：顶栏 / 侧边栏 / 输入框 / 统计行 / 轨迹视图 / 聊天气泡 /
  新会话按钮磨砂玻璃效果，设置里一键开关；云母 / 兼容双模式（兼容模式保持原版排版，
  只给输入框卡片与浮层上玻璃），模糊度、磨砂度、
  背景亮度自由调节（交互参考 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)）
- 🌫️ **玻璃拟态细节**：页面上下边缘渐变模糊、折叠侧边栏悬浮玻璃、
  纯色背景跟随主题底色——内容滚入视口边缘时柔化穿过，层次更立体
- 🎨 玻璃配色自动跟随当前 Catppuccin 主题
- 🔄 **检查 Catppuccin 插件更新**：设置页一键检测本插件（dsh-catppuccin）在 npm 上的最新版本，发现新版直接给出可复制的升级命令；**默认开启自动检查**（启动后一次 + 每 6 小时），更新渠道可选稳定版 / Beta
- 💻 **dsh-TUI 终端主题**：一条安装命令装进 dsh-TUI，四套主题自动同步到 `~/.dsh-tui/themes/`，见[安装 · dsh-TUI](#dsh-tui-终端版主题)

## 预览

四个主题在 DeepSeek Harness 中的实际效果（截图来自本地 GUI，文首大图为四主题斜切合成）：

<details>
<summary>🌻 Latte（浅色）</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/latte.png"/>
</details>
<details>
<summary>🪴 Frappé（深色）</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/frappe.png"/>
</details>
<details>
<summary>🌺 Macchiato（深色）</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/macchiato.png"/>
</details>
<details>
<summary>🌿 Mocha（深色）</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/mocha.png"/>
</details>

### 玻璃质感（Mica 云母模式）

同一会话在浅色（Latte）与深色（Mocha）下的磨砂玻璃效果：顶栏、侧边栏、
聊天气泡、输入框与统计行都是玻璃卡片，消息滚过页面边缘时被柔化，
背景为主题底色的纯色（截图来自本地 GUI）：

<details>
<summary>🌻 Latte（浅色玻璃）</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/glass-latte.png"/>
</details>
<details>
<summary>🌿 Mocha（深色玻璃）</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/glass-mocha.png"/>
</details>

## 安装

### 方式一：从 npm 安装（推荐）

```sh
dsh plugin --profile web add @nonamelego/dsh-catppuccin
```

装完重启 `dsh web` 即可，`dsh plugin` 会自动把它加进 profile 的 bundles。
其他 profile 把命令里的 `web` 换成对应名字即可（如 `headless`）。

**桌面版**：官方桌面壳与社区桌面壳都读**同一个 profile** `$DSH_HOME/profiles/desktop`，但
**两者装/升插件的方式完全不同、也不通用**——按你用的壳选一列：

| | 官方桌面壳（DeepSeek Harness 客户端） | 社区桌面壳（DSH Desktop） |
|---|---|---|
| **安装** | 应用内的**插件界面** → 添加插件 → 填包名 `@nonamelego/dsh-catppuccin`（也接受 Git 地址 / 压缩包 / 本地路径） | 在应用打开的 **DSH 终端**里执行命令：<br>`dsh plugin --profile desktop add @nonamelego/dsh-catppuccin` |
| **升级** | **先在插件界面里把插件删除，再重新填一遍同一个包名安装**（v0.2.0 没有升级入口，也没有版本选择器） | 与 web 同一条更新命令：<br>`dsh plugin --profile desktop update @nonamelego/dsh-catppuccin` |
| 谁执行 pnpm | 应用自带的 pnpm | 应用自带的 pnpm |

两种方式改完都要**重启桌面应用**才会加载新版本。

> ⚠️ **两列别混用**：官方壳的插件界面不执行命令；社区壳那条 `update` 命令对官方壳也不适用。
> 另外，**系统 PATH 上那个普通 `dsh` 两个壳都管不了 `desktop`**——上游把 `desktop` 当自己保留的
> profile，会直接报 `error: profile "desktop" is managed exclusively by the Electron application`。
> 想用 CLI 管就用别的 profile 名（`web`、`headless`、`dsh-tui`）。

> **两个桌面壳，同一个 profile**：官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
> 的 `apps/desktop` / `apps/desktop-host`（Electron）与社区的
> [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) 都启动
> `$DSH_HOME/profiles/desktop`，所以装好的插件两边都能用。本插件的桌面支持以
> **官方 web + 官方 desktop** 为维护核心；社区壳的 `desktopProfiles` 服务探测也保留。
> 但官方壳的 profile 进程**没有**专用的环境标记（它的 `DSH_DESKTOP_NODE_EXECUTABLE` 只注入给
> 包安装子进程），所以本插件改为识别 **Electron-as-node 运行时**（`process.versions.electron`）
> 来判定官方桌面版；设置的读写不受影响。

### 方式二：从仓库安装

```sh
dsh plugin --profile web add https://github.com/NoNameLeGo/dsh-catppuccin-theme
```

从 git 安装时 pnpm 可能要求允许构建脚本——按 pnpm 的提示把对应包加进 profile
`pnpm-workspace.yaml` 的 `allowBuilds` 后重跑一次即可。

桌面版同理，但按上面的表走：**官方壳**在插件界面里直接填 Git 地址；**社区壳**把这条命令的
`dsh plugin --profile web add …` 换成 `dsh plugin --profile desktop add …`。

### dsh-TUI（终端版）主题

与 Web GUI 插件同一个包。用标准的插件安装命令装进 dsh-tui profile：

```sh
dsh plugin --profile dsh-tui add @nonamelego/dsh-catppuccin
```

从仓库安装同理（也可用 git 形式，效果一致）：

```sh
dsh plugin --profile dsh-tui add https://github.com/NoNameLeGo/dsh-catppuccin-theme
```

包里带一个只做主题同步的小插件行（`dsh-catppuccin-tui-themes`，不依赖任何服务）：dsh-TUI 启动时自动把四套主题 JSON 同步到 `~/.dsh-tui/themes/`，之后升级包即同步新版配色。装完启动 `dsh --profile dsh-tui`，在 dsh-TUI 里用 `/theme` 选择 **Catppuccin Latte / Frappé / Macchiato / Mocha**，或直接 `/theme catppuccin-mocha` 切换（选择会持久化，下次启动自动恢复）。

> 💡 已为 Web GUI 装过本插件、同时用 dsh-TUI 的话，无需重复安装：Web 端每次
> 启动会自动同步主题到 `~/.dsh-tui/themes/`（仅当该目录已存在）。

> 📁 不想装包也可手动复制：把 `themes/*.json` 拷进 `~/.dsh-tui/themes/`
> （Windows：`%USERPROFILE%\.dsh-tui\themes\`），只是不随版本自动更新。

> ⚠️ `catppuccin-*.json` 归本插件所有、同步时会被覆盖；想自定义请改名另存。

> 💡 TUI 主题只管 TUI 内部配色，终端背景由你的终端决定——建议也配上对应
> 风味的 Catppuccin（见 [Catppuccin ports 列表](https://github.com/catppuccin/catppuccin#-ports)），观感最一致。

## 使用

1. 打开 Web GUI（默认 `http://127.0.0.1:3080`）；在 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) 中则直接打开桌面应用即可。
2. 进入 **设置 → 常规**。
3. 在 **外观** 区域下方找到 **Catppuccin** 行，选择主题：
   **Latte**（浅色）、**Frappé**、**Macchiato** 或 **Mocha**（深色）。
4. 选择 **跟随系统** 则回退到官方主题——会还原你启用 Catppuccin 之前
   的官方偏好（浅色 / 深色 / 跟随系统），而不是强制重置。

### Catppuccin 行里的其它选项

- **代码高亮风格**：默认 / **注释斜体**（italic-comments）——只影响代码块与 diff 的 shiki 高亮配色。
- **自定义覆盖**（折叠区，按钮上显示已有条数）：按「`--dsw-* 变量: 值`」逐条覆盖单个 token，
  例如 `--dsw-static-blue-500` → `#89b4fa`。**键名**失焦生效（必须以 `--` 开头，否则该条会被丢弃）；
  **值**同样失焦生效、**清空值即删除该条**；✕ 删除整行。覆盖持久保存，与所选风味一起生效。

### 玻璃质感

在 **设置 → 常规** 的 **Catppuccin 主题** 正下方找到 **玻璃质感** 行：

- **总开关**：开启后顶栏、侧边栏、输入框、统计行、轨迹视图变为磨砂玻璃；
  关闭即完全还原原生界面（无需刷新）。
- **模式**：**云母效果**把界面改成悬浮磨砂卡片；**兼容模式**保持原版排版，
  只把材质换成玻璃。
- **性能**：云母效果会在**大面积区域**（顶栏、输入框、侧边栏）做背景模糊，
  流式输出时占用 GPU 较明显（同一会话实测峰值约 80%，兼容模式不到 30%）；
  模糊半径本身不是主因（调到 0 px 也照样计费——只要不是 `none`，每帧都要回读背景）。
  在意占用就用**兼容模式**：它只在输入框卡片与浮层上做玻璃，命中面明显更小。
- **预设**：**清透 / 标准 / 磨砂** 三档一键套用；想微调再用下面的滑条
  （当前旋钮值与某档一致时该档高亮）。
- **玻璃模糊度**（0–40 px）、**磨砂度**（0–100%）：控制玻璃的模糊半径与
  不透明度。
- **背景亮度**：深色模式 0–50 压暗、浅色模式 50–100 提亮（50 为原样），
  直接调和进纯色背景。

玻璃配色自动跟随当前主题，切换 Latte / Frappé / Macchiato / Mocha 时即时
变色；所有设置跨重启自动恢复。

### 检查 Catppuccin 插件更新

在 **设置 → 常规** 的 **玻璃质感** 正下方找到 **检查 Catppuccin 插件更新** 行：

- 点击 **检查更新** 即对比 npm 上的最新版与当前版本：已是最新 → 显示当前
  版本号；发现新版 → 显示新版本号并给出可复制的升级命令（命令中的 profile
  名自动探测，无需手动替换；探测失败才回退为 `web`）。
- **自动检查**：默认开启——启动后检查一次、之后每 6 小时一次（该行可关闭）；
  **渠道**可选 **稳定版**（只跟 `latest`）或 **Beta 版**（连预发布一起跟）。
- 本插件为本地链接 / 源码安装（`link:` / `file:` / git）时不显示 npm 升级
  命令，会提示改用 `git pull` 或重新构建。
- 通道策略：正式版只跟随 `latest` 标签；预发布版同时跟随 `beta`（升级命令
  自动带 `@beta`）。离线或网络失败时显示原因并可重试。

## 玻璃拟态（Glassmorphism）

**玻璃拟态**是一种视觉风格：界面面板像一片磨砂玻璃——半透明填充、
背景模糊（`backdrop-filter: blur()`）和玻璃细节（描边、内高光、柔和投影），
透过它能看到并柔化背后的内容。

本插件的具体效果：

- **七个区域玻璃化**：顶栏、侧边栏、输入框、统计行、轨迹视图、聊天气泡
  和新会话按钮；云母模式下成为带圆角的悬浮卡片，聊天内容滚动时从玻璃
  下方穿过、被模糊；折叠侧边栏时导航条同样悬浮在聊天区边缘；
- **页面边缘渐变模糊**：视口上下各有一条渐变模糊带，消息滚到边缘时被
  柔化穿过——内容在边界「融化」（借鉴
  [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)
  的 Aqua 皮肤）；
- **配色自动跟随主题**：Latte 是浅色玻璃、Mocha 是深色玻璃，切换主题即时
  变色；页面底色取当前主题纯色，背景亮度旋钮直接往纯色里调和白/黑；
- **一键开关**：关闭即完全还原原生界面，插件卸载不留任何残留。

### 兼容模式会命中哪些面

兼容模式靠**类名子串与语义属性**给宿主与第三方插件的悬浮面加玻璃，不需要任何插件配合——
代价是子串匹配**无法区分「面」与「面里的行级容器」**。自 `0.5.8` 起，明确会被命中的族只剩这些：

| 族 | 锚点 |
|---|---|
| 输入框卡片 | `[data-composer-card]`（宿主自己的属性；材质画在它的 `::before` 上，见 issue #19） |
| 菜单 | `[role='menu']` |
| 弹出层 | `[class*='popover']` / `[class*='dropdown']`（这两个仍是子串） |
| 模态框 | `[role='dialog'][aria-modal='true']` |
| 宿主右侧栏（仅展开态） | `[data-sidebar-right-panel][data-sidebar-right-open]` |

`0.5.8` 按证据把最宽的三族收窄掉了（宽泛的 `card` 子串、`panel` 子串、行级 tooltip，详见
issue #17），但**第三方插件里新出现的类名仍可能被误命中**。默认收窄要讲证据，遇到时走下面三步。

#### 1. 取证（只读，粘进浏览器控制台）

列出当前所有被玻璃规则命中的元素、命中的规则原文与 computed 值：

```js
(() => {
  const rules = []
  for (const ss of document.styleSheets) {
    let rs; try { rs = ss.cssRules } catch { continue }
    for (const r of rs) if (r.selectorText && r.selectorText.includes('dsh-glass')) rules.push(r)
  }
  const out = []
  for (const el of document.querySelectorAll('[class*="card"],[class*="panel"],[role="tooltip"]')) {
    const hit = rules.filter(r => { try { return el.matches(r.selectorText) } catch { return false } })
    if (!hit.length) continue
    const cs = getComputedStyle(el), b = el.getBoundingClientRect()
    if (b.width < 8 || b.height < 8) continue
    out.push({ cls: String(el.className).slice(0, 48), w: Math.round(b.width), h: Math.round(b.height),
               bf: cs.backdropFilter, bg: cs.backgroundColor,
               rule: hit.map(x => x.style.cssText).join(' | ').slice(0, 60) })
  }
  console.table(out.slice(0, 40))
})()
```

#### 2. 临时止血

本插件**没有**「自定义 CSS」配置项（DSH 的 profile patch 层只能给插件写 `config`，没有通用样式入口；
但**个别第三方插件自带样式入口**，例如 `dsh-better-sidebar@0.21.1` 的 `customCss`——它 gate 在自身的
`titleBarScheme: 'custom'` 上、以 `data-dsh-custom-css` 注入，装了这类插件时也可以直接写在它的 `config` 里），
所以这一步要用外部注入——浏览器扩展（Stylus / 暴力猴）或 DevTools 的 Overrides——加一条
`!important` 规则把该族还原，例如：

```css
[class*='yourRow'] { backdrop-filter: none !important; background: none !important; outline: none !important; }
```

#### 3. 反馈

把第 1 步的表格输出连同 DSH 与插件版本贴到
[issues](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues)。`0.5.8` 就是这么修出来的：
报告人给了逐元素的 computed 对照，我们据此收窄**默认**规则——这也是为什么没有「自定义 CSS」
配置项：默认行为应该先是对的，配置项只能当补充。

### 环境限制：玻璃需要宿主提供可透出的底色

玻璃层用 `backdrop-filter` 读取**它背后实际被画出来的像素**。本插件只负责给面加材质，
**不负责给宿主造透明底**：宿主若把窗口与自绘容器刷成不透明色，玻璃面背后就没有可柔化的
内容，效果退化为**半透明叠色**——能看到色调，看不到悬浮/磨砂层次。

| 宿主 | 表现 | 原因 |
|---|---|---|
| 官方 Web GUI / 官方桌面壳 | 正常 | 窗口与容器提供可透出的底 |
| 第三方 DSH Desktop（`dsh-plugin-desktop` `2.0.17`） | 仅半透明叠色 | Windows 上静默把窗口材质强制为 `off`（设置里的 Mica/纯色选项选了不生效）；同时把侧栏表面与自绘容器刷成不透明面板色（`--dsh-desktop-frame-fill` / `.dshDesktopSidebarSurface` 取 `--dsw-alias-bg-layer-1`） |

**本插件不会为此加 `!important` 覆写**：那等于让插件去接宿主的容器结构，宿主一改就碎，
也偏离「只改材质」的定位。宿主将来若能提供 Windows 原生窗口材质（`backgroundMaterial: mica/acrylic`），
本套实现无需改动即可受益。

自查（玻璃「正常」与「观感平」返回的 computed 值可能**完全相同**，差别只在宿主有没有给出透明底）：

```js
const s = document.querySelector('[data-dsh-glass-surface]'), cs = getComputedStyle(s)
console.table({ backdropFilter: cs.backdropFilter, background: cs.backgroundColor,
  radius: cs.borderRadius, roots: [...document.documentElement.attributes]
    .map(a => a.name).filter(n => n.includes('glass')).join(', ') })
```

更早的第三方壳版本尚无可靠对照（无法确认当时主题/玻璃是否真的作用到侧栏），暂不下结论。

## 兼容性、权限与失败边界

### 兼容范围

| 项 | 声明 |
|---|---|
| DSH | `>=0.1.5-rc.1`（同时适配两套 settings seam：≤ `0.1.6-alpha.2` 的旧通道与 ≥ `0.1.7-alpha.1` 的 `configForms`） |
| Node.js | `>=20` |
| Profile | `web`（Web GUI 与两个桌面壳都启动 web 界面，共用本插件）；桌面端默认 profile 名为 `desktop`（已声明） |
| 已验证的具体版本 | `0.2.0-rc.2`：官方桌面壳自带运行时的启动级 e2e（19/19）、真机桌面窗口像素与标题栏取色链路、`configForms` 落盘（[审计](docs/desktop-0.2.0-adaptation-audit.md)）；`0.1.7-rc.1`：真实 profile 上完成安装、启动、改设置落盘与重启恢复（[证据](docs/issue-15-settings-seam-0.1.7.md)）；`0.1.7-rc.2`：启动级 e2e 与玻璃层的真页采样（issue #16 / #17）；`0.1.5-rc.1`：按 CI 口径复跑的启动级 e2e；`0.1.5-rc.3`、`0.1.7-alpha.1`、`0.1.7-alpha.2` 为同一 seam 的声明 |

以上也是 `package.json` 里 `dsh.compatibility`（`dsh` / `dshReleases` / `dshOperations`）的机器可读版本。
色彩覆盖以 `dsh-v0.2.0-rc.2` 的 `design-platform.css` 为基线：每方案 190 个 `--dsw-*` token（static 77 /
alias 101 / specific 11 / 非三族 1）全覆盖，含 0.2.0 新增的 17 个 alias。

### 权限与外部访问

| 类别 | 用途 | 边界 |
|---|---|---|
| 文件读 | 识别当前 profile 与安装来源（`$DSH_HOME/profiles/` 下的目录名）；一次性读取旧状态文件 `~/.dsh/catppuccin-state.json` 做迁移 | 只读；`DSH_HOME` 取自 `process.env.DSH_HOME`，缺省 `~/.dsh` |
| 文件写 | 把四套 TUI 主题 JSON 同步到 `~/.dsh-tui/themes/`（dsh-TUI 只从该目录读主题，无注册 API） | 只写这一个目录；`~/.dsh-tui` 不存在时是严格 no-op。设置本身由 DSH 的 settings 服务写入，插件只经官方服务读写 |
| 网络 | 「检查更新」读取 npm registry 上 `@nonamelego/dsh-catppuccin` 的元数据；页面侧再向本插件的宿主路由取一次结果 | 只访问 `registry.npmjs.org` 与同源插件路由；**无遥测、无上报**；离线时该行报错、不影响使用 |
| 命令 | 无 | 不执行任何子进程 / shell |
| 凭据 | 无 | 不读取任何 token、key、密码；仅读 `DSH_HOME` 与桌面壳标记类环境变量 |

### 失败边界

- 更新检查失败（离线、registry 异常、限流）只影响设置页那一行，**不阻塞启动**，也不影响主题与玻璃；
- 主题注册失败时 DSH 自身主题照常可用；
- 安装期只执行 `prepare`（本地用它构建 `lib/`）。仓库里的 `scripts/`（截图、E2E、changelog 生成）**不随 npm 包发布**（`files` 不含 `scripts`），也不会在安装时执行。

## 开发

```sh
pnpm install
pnpm typecheck       # tsc --noEmit：src 的类型检查
pnpm typecheck:tests # tsc --noEmit：tests 的类型检查（vitest 跑 esbuild，不做类型检查）
pnpm test            # vitest 跑配色表 / 契约 / e2e 覆盖测试
pnpm build           # tsdown 构建 -> lib/index.js（服务端）+ lib/client.js（浏览器）
```

配色表由生成器脚本产出——修改 `scripts/generate-palettes.mjs` 后重跑
（`--pin <sha>` 可把上游 commit SHA 写进 `palettes.ts` 头部，见
`docs/plugin-improvements.md` 的 L 项）：

```sh
node scripts/generate-palettes.mjs [--pin <upstream-sha>]
```

CHANGELOG 草稿由 conventional 提交生成（提交正文里的 `EN:` 行会被渲染成英文摘要）：

```sh
pnpm changelog:gen            # 打印上一 tag 之后的草稿
pnpm changelog:gen -- --write # 直接写入 [Unreleased] 节
```

对外 API（`./client`、`./tui-themes` 子路径导出）的 typedoc 文档**按需本地生成**到
`docs/api/`（该目录不入库、已进 `.gitignore`；哪天真需要在线版本再接 CI 发布）：

```sh
pnpm docs:api
```

贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)；状态契约的版本迁移约定见
[docs/state-migrations.md](docs/state-migrations.md)。

### 本地链接调试

克隆到本地后，把包链接进 profile（把路径换成你自己的；`$DSH_HOME` 默认是 `~/.dsh`）：

```sh
pnpm --dir ~/.dsh/profiles/web add link:/path/to/dsh-catppuccin
# Windows 例：
# pnpm --dir C:\Users\<you>\.dsh\profiles\web add link:D:\dev\dsh-catppuccin
```

再把 `@nonamelego/dsh-catppuccin` 加进 profile `package.json` 的
`dsh.profile.bundles`，重启 `dsh web`。DSH Desktop 用
`~/.dsh/profiles/desktop` 对应路径。

## 🙋 常见问题

- Q: **_"为什么外观行里看不到 Catppuccin 主题？"_**\
  A: 官方外观行只列出内置的浅色/深色/跟随系统偏好。四个主题在它正下方的
  **Catppuccin** 行里。
- Q: **_"我的主题选择是怎么记住的？"_**
  A: 选择持久保存在 DSH 的官方设置里（同一台机器的 DSH 共享这份偏好），浏览器
  localStorage 作为即时缓存与多标签页同步。落点随 DSH 版本而异：**0.1.6 及更早**
  存于 DSH home 下的官方 settings 文档（`catppuccin` 命名空间）；**0.1.7 起**上游
  改为「插件配置表单」，落点是当前 profile 的 patch 文件里本插件的 `config:` 段
  （本插件两套都支持，按宿主实际提供的服务自动选择）。因此换浏览器、清站点数据、
  自定义端口（`dsh web --port`）或再开一个桌面实例，偏好都不会丢；
  **DSH Desktop**（官方壳与 `anywhere-labs/dsh-desktop`）同样跨重启自动恢复。
  玻璃质感开关与各旋钮同样持久保存。0.5.0 起旧版 `catppuccin-state.json`
  会在首次启动时一次性迁移进官方设置（文件保留作回退）。
- Q: **_"窄窗口下侧边栏没有自动收起、主内容区被压得很窄，是插件的问题吗？"_**\
  A: 不是。这是 DSH 上游 `ui-layout` 的行为：视口 **< 1024px** 时侧栏**默认自动收起**；
  只有你手动点过侧栏开关，它才会以 280px 展开并挤压主区（主区 = 视口宽 − 280，501px
  窗口下就是 221px），再点一次即收回。上游把这个「窄帧手动展开挤压」列为已知限制。
  侧栏滚动条也是上游的**指针可达性**提示：指针不在侧栏内时不绘制，移进去（或直接滚轮）
  就会出现。逐项实测读数与上游代码坐标见
  [docs/issue-18-narrow-sidebar.md](docs/issue-18-narrow-sidebar.md)。
- Q: **_"怎么知道这个插件有没有新版本？"_**
  A: 设置 → 常规 → **检查 Catppuccin 插件更新** 一键检测本插件在 npm 上的最新版本，
  发现新版会给出可复制的升级命令；也可以随时手动执行
  `dsh plugin --profile web update @nonamelego/dsh-catppuccin`
  （或重新 `add` 最新版）。
  **桌面版要分壳**：社区壳 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) 在应用内的
  DSH 终端里用同一条命令（把 `web` 换成 `desktop`）；**官方壳没有升级入口**——要在插件界面里
  **先删掉本插件，再重新填一遍包名 `@nonamelego/dsh-catppuccin` 安装**，然后重启应用。
  两种方式不通用，详见上面「安装 → 桌面版」的对照表。

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
