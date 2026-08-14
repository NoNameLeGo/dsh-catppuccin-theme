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

## About

A [Catppuccin](https://github.com/catppuccin/catppuccin) theme plugin for the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI
(`dsh web`). It registers the four Catppuccin flavours — Latte, Frappé,
Macchiato and Mocha — into the official theme system, remapping the entire
`--dsw-*` design-token ladder, and adds a **Catppuccin** row to
**Settings → General → Appearance** so you can switch flavours without leaving
the settings page. Your choice is persisted and restored on the next boot.

## Previews

The palettes, as rendered by this plugin:

<details>
<summary>🌻 Latte</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/latte.webp"/>
</details>
<details>
<summary>🪴 Frappé</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/frappe.webp"/>
</details>
<details>
<summary>🌺 Macchiato</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/macchiato.webp"/>
</details>
<details>
<summary>🌿 Mocha</summary>
<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/previews/mocha.webp"/>
</details>

## Usage

### Install the plugin

Add the plugin to a dsh web profile (the bundle is an official dsh plugin
shape — install it from this repository):

```sh
dsh plugin --profile <name> add <path-or-git-url>
```

For a local checkout, you can link it directly into the profile:

```sh
pnpm --dir <profile-dir> add link:<path-to-this-repo>
```

then add `dsh-catppuccin` to the profile's `bundles` list and restart
`dsh web`.

### Switch flavours

1. Open the web GUI at `http://127.0.0.1:3080`.
2. Go to **Settings → General**.
3. Below the **Appearance** section, pick a flavour in the **Catppuccin**
   row — Latte (light), Frappé, Macchiato, or Mocha (dark).
4. Choose **Off** to fall back to the official theme (system-following).

## Development

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest (palette token coverage)
pnpm build       # tsdown -> lib/index.js (host) + lib/client.js (browser)
```

Token mappings are generated from the Catppuccin palette definitions — rerun
`node scripts/generate-palettes.mjs` after editing the generator, then rebuild.

## 🙋 FAQ

- Q: **_"Why does the Appearance row not show the Catppuccin flavours?"_**\
  A: The official row only lists the built-in light/dark/system preferences.
  The flavours live in the dedicated **Catppuccin** row right below it.
- Q: **_"How is my flavour choice remembered?"_**\
  A: It is persisted in the `dsh-catppuccin` settings namespace (host half)
  and restored by the browser half on boot.

## 💝 Thanks to

- [Catppuccin](https://github.com/catppuccin) for the palettes and the port template

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
