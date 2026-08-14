<h3 align="center">
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/logos/exports/1544x1544_circle.png" width="100" alt="Logo"/><br/>
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
	Catppuccin for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
</h3>

<p align="center">
	<a href="https://github.com/NoNameLeGo/dsh-catppuccin/stargazers"><img src="https://img.shields.io/github/stars/NoNameLeGo/dsh-catppuccin?colorA=363a4f&colorB=b7bdf8&style=for-the-badge"></a>
	<a href="https://github.com/NoNameLeGo/dsh-catppuccin/issues"><img src="https://img.shields.io/github/issues/NoNameLeGo/dsh-catppuccin?colorA=363a4f&colorB=f5a97f&style=for-the-badge"></a>
	<a href="https://github.com/NoNameLeGo/dsh-catppuccin/contributors"><img src="https://img.shields.io/github/contributors/NoNameLeGo/dsh-catppuccin?colorA=363a4f&colorB=a6da95&style=for-the-badge"></a>
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/preview.webp"/>
</p>

## 简介

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI
（`dsh web`）的 [Catppuccin](https://github.com/catppuccin/catppuccin) 主题插件。

插件将 Catppuccin 的四种风味——**Latte**、**Frappé**、**Macchiato**、**Mocha**——
注册进官方主题系统，完整重映射整套 `--dsw-*` 设计令牌；并在
**设置 → 常规 → 外观** 下方新增一行 **Catppuccin**，无需离开设置页即可切换风味。
选择会被持久化保存，下次启动自动恢复。

## 特性

- 🎨 四种风味全覆盖：Latte（浅色）、Frappé / Macchiato / Mocha（深色）
- 🧩 接入官方 ThemeRuntime，与内置浅色/深色/跟随系统主题平级
- 🎯 完整重映射 `--dsw-*` 令牌阶梯（4 风味 × 162 个令牌，含别名层 `var()` 引用）
- ⚙️ 设置页专属 **Catppuccin** 行：一键切换，选择持久化，重启自动恢复
- 🌐 中英文双语界面文案（跟随系统语言）

## 预览

四种风味对应的色板：

<details>
<summary>🌻 Latte（浅色）</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/latte.webp"/>
</details>
<details>
<summary>🪴 Frappé（深色）</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/frappe.webp"/>
</details>
<details>
<summary>🌺 Macchiato（深色）</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/macchiato.webp"/>
</details>
<details>
<summary>🌿 Mocha（深色）</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/mocha.webp"/>
</details>

## 安装

### 方式一：从仓库安装（推荐）

插件是标准的 dsh 插件形态，直接添加到你的 web profile：

```sh
dsh plugin --profile <profile名> add https://github.com/NoNameLeGo/dsh-catppuccin
```

### 方式二：本地链接

克隆到本地后，把包链接进 profile 并加入 bundles：

```sh
pnpm --dir <profile目录> add link:<本仓库路径>
```

然后在 profile 的 `package.json` 中把 `dsh-catppuccin` 加进 `dsh.profile.bundles`，
重启 `dsh web` 即可。

## 使用

1. 打开 Web GUI（默认 `http://127.0.0.1:3080`）。
2. 进入 **设置 → 常规**。
3. 在 **外观** 区域下方找到 **Catppuccin** 行，选择风味：
   **Latte**（浅色）、**Frappé**、**Macchiato** 或 **Mocha**（深色）。
4. 选择 **关闭** 则回退到官方主题（跟随系统）。

## 开发

```sh
pnpm install
pnpm typecheck   # tsc --noEmit 类型检查
pnpm test        # vitest 跑令牌覆盖测试
pnpm build       # tsdown 构建 -> lib/index.js（host）+ lib/client.js（浏览器）
```

令牌映射由生成器脚本产出——修改 `scripts/generate-palettes.mjs` 后重跑：

```sh
node scripts/generate-palettes.mjs
```

## 🙋 常见问题

- Q: **_"为什么外观行里看不到 Catppuccin 风味？"_**\
  A: 官方外观行只列出内置的浅色/深色/跟随系统偏好。四种风味在它正下方的
  **Catppuccin** 行里。
- Q: **_"我的风味选择是怎么记住的？"_**
  A: 由 host 半注册在 `dsh-catppuccin` 设置命名空间，浏览器半在启动时恢复。

## 💝 致谢

- [Catppuccin](https://github.com/catppuccin) 提供的色板与 port 模板
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件体系

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
