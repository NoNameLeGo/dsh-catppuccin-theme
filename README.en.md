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

**English** | [中文](README.md)

> A theme & glassmorphism plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Catppuccin flavours for the **Web GUI**, **DSH Desktop** and **dsh-TUI**, plus a switchable frosted-glass skin. Listed on [Awesome DSH Plugin](https://awesome-dsh-plugin.com/p/NoNameLeGo__dsh-catppuccin-theme/).

## Contents

- [Introduction](#introduction)
- [Features](#features)
- [Previews](#previews)
- [Installation](#installation)
- [Usage](#usage)
- [Glassmorphism](#glassmorphism)
- [Compatibility, permissions and failure bounds](#compatibility-permissions-and-failure-bounds)
- [Development](#development)
- [🙋 FAQ](#-faq)
- [💝 Credits](#-credits)

<p align="center">
	<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/combined.png" width="100%" alt="DeepSeek Harness under the four Catppuccin flavours"/>
	<br/><br/>
	<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/glass-combined.png" width="100%" alt="Glass skin · Latte & Mocha"/>
</p>

## Introduction

A [Catppuccin](https://github.com/catppuccin/catppuccin) theme plugin for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — one package that fits
the **Web GUI** (`dsh web`), the **desktop shells** (the official Electron `apps/desktop` and the
community DSH Desktop — both on the same `desktop` profile) and **dsh-TUI** alike: full recolouring plus a
glass skin on Web / Desktop, and the four official theme palettes auto-synced to the TUI.

It ships all four Catppuccin flavours — **Latte**, **Frappé**, **Macchiato**, **Mocha** —
remapping the whole interface to the matching palette, with a **Catppuccin** row right below
**Settings → General → Appearance** for one-click switching. Your choice is persisted and
restored after restarts.

It also includes an optional **glassmorphism** skin: the top bar, sidebar, composer,
stats line, trajectory view, chat bubbles and the new-session button become frosted-glass
cards, with adjustable blur, frost and backdrop brightness. Glass colours follow the active
Catppuccin theme automatically.

## Features

- 🎨 Four themes: Latte (light), Frappé / Macchiato / Mocha (dark)
- 🧩 Registered into the official theme system, on a par with the built-in light / dark / system themes
- 🎯 Full-UI colour coverage — not just one or two accent colours
- ⚙️ One-click switch in Settings, persisted and restored across restarts
- 🔧 **Custom token overrides**: override individual colour tokens with `--dsw-* var: value` pairs (e.g. turn comments blue); persisted alongside the selected flavour
- 🖍️ **Code-block highlight style**: default / italic-comments shiki themes
- 🌐 Seven UI languages (Chinese / English / Japanese / Korean / Spanish / French / German, follows the system language)
- 🪟 **Glass skin** (Mica mode): frosted glass for the top bar / sidebar / composer / stats line /
  trajectory view / chat bubbles / new-session button, one-click toggle in Settings;
  mica & compatibility modes (Compatibility keeps the stock layout and only frosts the composer
  card and floating layers), adjustable blur, frost and backdrop brightness
  (interaction reference: [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin))
- 🌫️ **Glass details**: gradient blur bands at the top/bottom page edges, a floating glass
  rail when the sidebar is collapsed, a solid background in the theme's own base colour —
  content softens as it scrolls under the panes
- 🎨 Glass colours follow the current Catppuccin theme
- 🔄 **Update check**: one-click "Check for updates" in Settings compares the latest npm
  version and gives you a copyable upgrade command; **auto-check is on by default** (once at
  startup, then every 6 hours) and the release channel switches between stable and beta
- 💻 **dsh-TUI terminal themes**: one command installs into dsh-TUI; the four themes sync to
  `~/.dsh-tui/themes/` automatically (see [Installation · dsh-TUI](#dsh-tui-terminal-themes))

## Previews

Actual screenshots from a local GUI (the header image is a diagonal blend of the four):

<details>
<summary>🌻 Latte (light)</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/latte.png"/>
</details>
<details>
<summary>🪴 Frappé (dark)</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/frappe.png"/>
</details>
<details>
<summary>🌺 Macchiato (dark)</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/macchiato.png"/>
</details>
<details>
<summary>🌿 Mocha (dark)</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/mocha.png"/>
</details>

### Glass skin (Mica mode)

The frosted-glass effect in light (Latte) and dark (Mocha): the top bar, sidebar,
chat bubbles, composer and stats line are all glass cards; messages soften as they scroll
past the page edges; the background is the theme's solid base colour:

<details>
<summary>🌻 Latte (light glass)</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/glass-latte.png"/>
</details>
<details>
<summary>🌿 Mocha (dark glass)</summary>
<img src="https://raw.githubusercontent.com/NoNameLeGo/dsh-catppuccin-theme/main/assets/previews/glass-mocha.png"/>
</details>

## Installation

### Option 1: from npm (recommended)

```sh
dsh plugin --profile web add @nonamelego/dsh-catppuccin
```

Restart `dsh web` after installing — `dsh plugin` adds it to the profile's bundles.
Use the profile name of your choice in place of `web` (e.g. `headless`).

**Desktop**: the desktop build's active profile is named `desktop`
(`$DSH_HOME/profiles/desktop`), so run:

```sh
dsh plugin --profile desktop add @nonamelego/dsh-catppuccin
```

Run it in the DSH terminal of the desktop app (`dsh plugin` defaults to the active profile),
then restart the app.
Installing from the repo works the same way: `dsh plugin --profile desktop add https://github.com/NoNameLeGo/dsh-catppuccin-theme`.

> ⚠️ **Upgrading on the official desktop build (the Electron shell)** does not go through the CLI:
> open the **plugin manager UI, remove this plugin, then re-enter the npm package name
> `@nonamelego/dsh-catppuccin` to install it**, and restart the app to load the new version.
> `dsh plugin --profile desktop update` (or re-`add`) has no effect inside the shell.

> **Two desktop shells, one profile**: the official
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) monorepo ships
> `apps/desktop` / `apps/desktop-host` (Electron, still in development), and the community
> [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) does the same — both boot
> `$DSH_HOME/profiles/desktop`, so the command above works for either. This plugin's desktop support
> targets the **official web + desktop** builds; the community shell's `desktopProfiles` service probe
> is kept. The official shell's profile process carries **no** dedicated env marker (its
> `DSH_DESKTOP_NODE_EXECUTABLE` is injected only into its package-install children), so the plugin
> detects that shell through the **Electron-as-node runtime** (`process.versions.electron`) instead —
> the profile name shown in the upgrade copy is therefore correct, and settings reads/writes are
> unaffected (see the comment in `src/profile-detect.ts`).

### Option 2: from the repository

```sh
dsh plugin --profile web add https://github.com/NoNameLeGo/dsh-catppuccin-theme
```

When installing from git, pnpm may ask you to allow build scripts — follow pnpm's prompt
and add the package to the profile's `pnpm-workspace.yaml` `allowBuilds`, then run it again.

### dsh-TUI (terminal) themes

The same package covers the TUI. Install it into the dsh-tui profile:

```sh
dsh plugin --profile dsh-tui add @nonamelego/dsh-catppuccin
```

Installing from the repository works the same way:

```sh
dsh plugin --profile dsh-tui add https://github.com/NoNameLeGo/dsh-catppuccin-theme
```

The package ships a tiny theme-sync plugin row
(`dsh-catppuccin-tui-themes`, no service dependencies): on every dsh-TUI start it syncs the
four theme JSONs to `~/.dsh-tui/themes/`, so upgrades pick up the new palettes. After
installing, launch `dsh --profile dsh-tui` and pick the theme with `/theme` —
**Catppuccin Latte / Frappé / Macchiato / Mocha**, or jump straight to it with
`/theme catppuccin-mocha` (your choice persists across restarts).

> 💡 Already installed the plugin for the Web GUI and also use dsh-TUI? No need to install
> it twice: every Web start auto-syncs the themes to `~/.dsh-tui/themes/` (only when the
> directory already exists).

> 📁 Prefer not to install the package? Copy `themes/*.json` into
> `~/.dsh-tui/themes/` (Windows: `%USERPROFILE%\.dsh-tui\themes\`) by hand — you just won't
> get updates automatically.

> ⚠️ `catppuccin-*.json` belongs to this plugin and is overwritten on sync; rename the files
> if you want custom themes.

> 💡 TUI themes only style the TUI itself — the terminal background is up to your terminal.
> Pairing it with the matching Catppuccin flavour (see the
> [Catppuccin ports list](https://github.com/catppuccin/catppuccin#-ports)) looks best.

## Usage

1. Open the Web GUI (default `http://127.0.0.1:3080`), or the DSH Desktop app.
2. Go to **Settings → General**.
3. Find the **Catppuccin** row below **Appearance** and pick a flavour:
   **Latte** (light), **Frappé**, **Macchiato** or **Mocha** (dark).
4. Choosing **Follow system** reverts to the official theme — it restores the preference
   you had before enabling Catppuccin (light / dark / follow system) instead of forcing a reset.

### Other options in the Catppuccin row

- **Code highlight style**: default / **italic comments** — affects only the shiki colours used
  in code blocks and diffs.
- **Custom overrides** (collapsible; the button shows the entry count): override individual tokens
  with `--dsw-* var: value` pairs, e.g. `--dsw-static-blue-500` → `#89b4fa`. The **key** commits on
  blur and must start with `--` (otherwise the entry is dropped); the **value** also commits on blur,
  and an **empty value deletes the entry**; ✕ removes the row. Overrides persist with the flavour.

### Glass skin

Right below the **Catppuccin theme** row in **Settings → General** you'll find the **Glass** row:

- **Master switch**: on — the top bar, sidebar, composer, stats line and trajectory view
  become frosted glass; off — the UI reverts to stock instantly (no refresh needed).
- **Mode**: **Mica** turns the interface into floating frosted cards; **Compatibility** keeps
  the stock layout and swaps only the material.
- **Performance**: Mica blurs **large areas** (top bar, composer, sidebar), which shows up as
  GPU load while output streams (measured ~80% peak in one conversation, under 30% for
  Compatibility); the blur radius is not the driver — anything but `none` re-reads the backdrop
  every frame, `0 px` included. Prefer **Compatibility** if that matters: it only frosts the
  composer card and floating layers, a much smaller footprint.
- **Presets**: **Clear / Standard / Frosted** one-click presets; fine-tune with the sliders
  afterwards (a preset lights up when the current knob values match it).
- **Blur** (0–40 px) and **Frost** (0–100%): the blur radius and opacity of the glass.
- **Backdrop brightness**: dark mode darkens 0–50, light mode brightens 50–100 (50 = as-is),
  mixed straight into the solid background.

Glass colours follow the active theme live; all settings persist across restarts.

### Check for plugin updates

In **Settings → General**, right below the **Glass** row:

- Clicking **Check for updates** compares the latest npm version with the installed one:
  up to date → shows the current version; newer → shows the new version plus a copyable
  upgrade command (the profile name is detected automatically, falling back to `web`).
- **Auto-check**: on by default — once after startup, then every 6 hours (switch it off on this row);
  the **Channel** picks **Stable** (follows `latest` only) or **Beta** (prereleases too).
- Locally linked / source installs (`link:` / `file:` / git) don't show an npm upgrade
  command — you'll be told to `git pull` or rebuild instead.
- Channel policy: stable builds follow the `latest` tag; prereleases follow both `latest`
  and `beta` (the upgrade command automatically carries `@beta`). Offline or network
  failures show the reason and offer a retry.

## Glassmorphism

**Glassmorphism** is a visual style in which panels look like frosted glass — translucent
fills, backdrop blur (`backdrop-filter: blur()`), and glass details (rim, inner highlight,
soft shadow) — letting the content behind show through, softened.

What this plugin does:

- **Seven glass areas**: top bar, sidebar, composer, stats line, trajectory view, chat
  bubbles and the new-session button; in Mica mode they become rounded floating cards and
  chat content scrolls *under* the glass, blurred; the collapsed sidebar becomes a
  floating rail at the edge of the chat area;
- **Page-edge gradient blur**: a blur band at the top and bottom of the viewport so
  messages are softened as they melt past the edges (borrowed from
  [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)'s
  Aqua skin);
- **Theme-following colours**: Latte is light glass, Mocha dark glass — switching flavours
  recolours instantly. The page ground is the theme's solid colour; the brightness knob
  mixes white/black straight into it;
- **One-click toggle**: off restores the stock UI exactly; uninstalling the plugin leaves
  nothing behind.

### What Compatibility mode matches

Compatibility mode frosts host and third-party floating surfaces through **class substrings and
semantic attributes**, needing no cooperation from other plugins — the price is that a substring
cannot tell a *surface* from a *row-level container inside one*. Since `0.5.8` the families it
matches are exactly these:

| Family | Anchor |
|---|---|
| Composer card | `[data-composer-card]` (the host's own attribute) |
| Menus | `[role='menu']` |
| Popovers | `[class*='popover']` / `[class*='dropdown']` (still substrings) |
| Modal dialogs | `[role='dialog'][aria-modal='true']` |
| Host right sidebar (open state only) | `[data-sidebar-right-panel][data-sidebar-right-open]` |

`0.5.8` narrowed the three widest families out of the sheet on evidence (the `card` substring, the
`panel` substring and row-level tooltips — see issue #17), but a **new class name in a third-party
plugin can still be misread**. Defaults only change with evidence, so when you hit one:

**1. Collect evidence** (read-only — paste into the browser console). Lists every element the glass
rules match, the matched rule text and its computed values:

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

**2. Stop the bleeding locally.** The plugin has **no** "custom CSS" option (DSH's profile patch
layer can only write plugin `config` — there is no generic style entry point), so this needs an
external injector: a browser extension (Stylus / Violentmonkey) or DevTools Overrides with an
`!important` rule, e.g.

```css
[class*='yourRow'] { backdrop-filter: none !important; background: none !important; outline: none !important; }
```

**3. Report it.** Paste step 1's output plus your DSH and plugin versions into
[issues](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues). That is how `0.5.8` was built:
the reporter supplied per-element computed values and we narrowed the **defaults** — which is also
why there is no "custom CSS" option: the default should be right first, an escape hatch is only a
supplement.

### Environment limit: glass needs a see-through base from the host

The glass layer reads, via `backdrop-filter`, **the pixels actually painted behind it**. The plugin
only adds material to a surface — it does **not** create a transparent base for the host. If the host
paints the window and its own containers opaque, there is nothing behind the glass to soften and the
effect degrades to a **translucent tint**: you see the hue, but no floating/frosted depth.

| Host | Result | Cause |
|---|---|---|
| Official Web GUI / official desktop shell | normal | window and containers provide a see-through base |
| Third-party DSH Desktop (`dsh-plugin-desktop` `2.0.17`) | translucent tint only | on Windows it silently forces window material to `off` (the Mica / solid-colour setting has no effect), and paints the sidebar surface and its self-drawn containers with an opaque panel colour (`--dsh-desktop-frame-fill` / `.dshDesktopSidebarSurface`, both sourced from `--dsw-alias-bg-layer-1`) |

**The plugin will not add `!important` overrides for this**: that would make the plugin responsible for
the host's container structure, break whenever the host changes, and step outside its "material only"
scope. If a host later exposes native window material on Windows (`backgroundMaterial: mica/acrylic`),
this implementation benefits with no changes.

Self-check (computed values may be **identical** between a "working" and a "flat" environment — the only
difference is whether the host provides a transparent base):

```js
const s = document.querySelector('[data-dsh-glass-surface]'), cs = getComputedStyle(s)
console.table({ backdropFilter: cs.backdropFilter, background: cs.backgroundColor,
  radius: cs.borderRadius, roots: [...document.documentElement.attributes]
    .map(a => a.name).filter(n => n.includes('glass')).join(', ') })
```

Earlier versions of the third-party shell have no reliable comparison yet (we could not confirm the
theme/glass actually reached the sidebar in that run), so no conclusion is drawn for them.

## Compatibility, permissions and failure bounds

### Compatibility

| Item | Declaration |
|---|---|
| DSH | `>=0.1.5-rc.1` (both settings seams: the legacy channel on ≤ `0.1.6-alpha.2` and `configForms` on ≥ `0.1.7-alpha.1`) |
| Node.js | `>=20` |
| Profile | `web` (the Web GUI and both desktop shells run the web UI and share this plugin); desktop profiles are named `desktop` |
| Verified exact version | `0.1.7-rc.1`: installed, started, persisted a setting to disk and restored it across a restart in a real profile ([evidence](docs/issue-15-settings-seam-0.1.7.md)); `0.1.7-rc.2`: boot-level e2e and live-page sampling of the glass layer (issues #16 / #17); `0.1.5-rc.3`, `0.1.7-alpha.1` and `0.1.7-alpha.2` are declared as the same seam |

The machine-readable form of the above is `dsh.compatibility` (`dsh` / `dshReleases` /
`dshOperations`) in `package.json`.

### Permissions and external access

| Category | Purpose | Bound |
|---|---|---|
| File reads | Identify the active profile and install source (directory names under `$DSH_HOME/profiles/`); one-off read of the legacy state file `~/.dsh/catppuccin-state.json` for migration | Read-only. `DSH_HOME` comes from `process.env.DSH_HOME`, defaulting to `~/.dsh` |
| File writes | Sync the four TUI theme JSONs into `~/.dsh-tui/themes/` (dsh-TUI reads themes only from there; no registration API) | That one directory only; a strict no-op when `~/.dsh-tui` does not exist. Settings themselves are written by DSH's settings service, through its official services |
| Network | The "check for updates" row reads npm registry metadata for `@nonamelego/dsh-catppuccin`; the page then fetches the result from this plugin's own host route | `registry.npmjs.org` and the same-origin plugin route only. **No telemetry, no reporting.** Offline, the row errors and nothing else is affected |
| Commands | None | No subprocesses, no shell |
| Credentials | None | No tokens, keys or passwords; only `DSH_HOME` and desktop-shell marker environment variables are read |

### Failure bounds

- A failed update check (offline, registry error, rate limit) affects only that settings
  row — it never blocks startup, themes or glass;
- If theme registration fails, DSH's own themes keep working;
- The only install-time script is `prepare` (used locally to build `lib/`). The repository's
  `scripts/` (screenshots, E2E, changelog generation) are **not published** to npm
  (`files` excludes them) and never run on install.

## Development

```sh
pnpm install
pnpm typecheck       # tsc --noEmit: type check for src
pnpm typecheck:tests # tsc --noEmit: type check for the specs (vitest transpiles, it never type checks)
pnpm test            # vitest palette-coverage tests
pnpm build           # tsdown build -> lib/index.js (host) + lib/client.js (browser)
```

Palettes are produced by a generator script — after editing
`scripts/generate-palettes.mjs`, rerun:

```sh
node scripts/generate-palettes.mjs
```

The changelog draft is generated from your conventional commits (bilingual `EN:` support
in commit bodies):

```sh
pnpm changelog:gen            # print the draft since the last tag
pnpm changelog:gen -- --write # write it into the [Unreleased] section
```

TypeDoc docs for the public API (`./client`, `./tui-themes` subpath exports) are generated
locally on demand into `docs/api/` (that directory is **not** committed — it's in
`.gitignore`; wire up CI Pages publishing later if an online copy is ever wanted):

```sh
pnpm docs:api
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution guide and
[docs/state-migrations.md](docs/state-migrations.md) for the state versioning contract.

### Local link debugging

Clone the repo, link it into a profile and add it to the bundles (use your own paths;
`$DSH_HOME` defaults to `~/.dsh`):

```sh
pnpm --dir ~/.dsh/profiles/web add link:/path/to/dsh-catppuccin
# Windows example:
# pnpm --dir C:\Users\<you>\.dsh\profiles\web add link:D:\dev\dsh-catppuccin
```

Then add `@nonamelego/dsh-catppuccin` to the profile's `package.json`
`dsh.profile.bundles` and restart `dsh web`. For DSH Desktop use
`~/.dsh/profiles/desktop` instead.

## 🙋 FAQ

- **Q: "Why don't I see the Catppuccin themes in the Appearance row?"**\
  A: The stock Appearance row only lists the built-in light / dark / follow-system
  preferences. The four flavours live in the **Catppuccin** row right below it.
- **Q: "How is my theme choice remembered?"**
  A: The choice persists in DSH's official settings document (the `catppuccin` namespace,
  stored under the DSH home, shared across every DSH instance on the machine), with
  localStorage as an in-browser cache and cross-tab sync. So switching browser,
  clearing site data, a custom port (`dsh web --port <custom>`) or a second desktop
  instance never loses the preference; **DSH Desktop** (the official shell and
  `anywhere-labs/dsh-desktop`) restores it across restarts too. The glass switch and every
  knob persist the same way. Since 0.5.0, a legacy `catppuccin-state.json` is migrated
  into the official settings once on first launch (the file is kept as a rollback copy).
- **Q: "How do I know if this plugin has a new version?"**
  A: Settings → General → **Check Catppuccin plugin updates** compares against npm in one
  click and gives a copyable upgrade command; or run
  `dsh plugin --profile web update @nonamelego/dsh-catppuccin` manually (re-`add` the
  latest version works too). In [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop),
  use `desktop` as the profile name, or just run `dsh plugin update` in the app's DSH terminal.
  ⚠️ **Exception — the official desktop build**: upgrade from its **plugin manager UI** instead
  (**remove this plugin, then re-enter the npm package name `@nonamelego/dsh-catppuccin`**),
  then restart the app; the shell does not honour `dsh plugin update`.

## 💝 Credits

- [Catppuccin](https://github.com/catppuccin/catppuccin) for the palettes and port templates
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) for the plugin system
- [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)
  for the glass-skin interaction and implementation reference (mica / compatibility modes,
  blur / frost / brightness knobs)

&nbsp;

<p align="center">
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" />
</p>

<p align="center">
	Copyright &copy; 2021-present <a href="https://github.com/catppuccin/catppuccin" target="_blank">Catppuccin Org</a>
</p>

<p align="center">
	<a href="https://github.com/catppuccin/catppuccin/blob/main/LICENSE"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>