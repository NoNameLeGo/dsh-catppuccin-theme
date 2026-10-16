/**
 * Catppuccin glass layer — one toggleable glassmorphism skin over the whole
 * Web surface, riding on top of the Catppuccin themes. Everything the layer
 * owns is an effect: the CSS hooks ride a `data-dsh-glass` attribute on
 * <html> (the stylesheet only applies under it), the seam stamps ride a
 * MutationObserver, and the page-edge fade bands are DOM elements — so
 * switching the flag off (or unloading the plugin) restores the stock UI
 * exactly: no residue, no reload.
 *
 * The page ground is an AMBIENT field built from the active theme's own
 * tokens (issue #25): a same-family wash plus two low-alpha glows over the
 * `bg-base` colour (the CSS lives in glass.module.css). The brightness knob
 * mixes white/black straight into the base stop AND fades the ambience out
 * at the extremes, so a maxed-out slider still collapses to the pure-white /
 * pure-black ground. The 0.2.x animated scene (drifting blobs + hue rotation
 * + a hue knob) stays removed — the STATIC field is what makes the glass
 * fills readable; blur is not involved.
 *
 * The enable flag and every knob persist in localStorage — the in-browser
 * cache and cross-tab sync bus. The DURABLE copy of the same state lives in
 * the official settings store under the DSH home (namespace `catppuccin` / the
 * profile entry form, see `src/state.ts` — the Host declares it, the Client
 * binds whichever seam the host serves through `src/client/state-sync.ts` and
 * hydrates via `applyRemote` / `getRemoteState`):
 * required because localStorage is per-browser and per-origin, while the DSH
 * home is the machine-wide truth (see the rationale in `src/state.ts`). On
 * profiles without a usable settings transport the layer simply keeps working
 * from localStorage alone. The enable flag and knobs themselves stay
 * client-only visual preferences shared with the plugin alone, needing no host
 * configuration.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the theme plugin's Context merge (ctx.theme + theme/change).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { startGlassSeamStamper } from './glass-seams.ts'
import { GLASS_CSS_TEXT } from './glass-css.gen.ts'
import { DEFAULT_GLASS, type GlassState } from '../../state.ts'

/** html attribute selecting the glass layer: CSS hooks and page effects. */
export const GLASS_ATTRIBUTE = 'data-dsh-glass'

/** html attribute selecting the mica (floating-card) layout rules. */
export const GLASS_FLOAT_ATTRIBUTE = 'data-dsh-glass-float'

/** html attribute selecting the compatibility (stock-layout) rules. */
export const GLASS_COMPAT_ATTRIBUTE = 'data-dsh-glass-compat'

/** The knob-driven custom properties `applySettings()` publishes. They live on
 *  <html> (the stylesheet's root scope) and are MIRRORED onto <body> for one
 *  reason: the official desktop shell re-reads its native caption colour when
 *  <body>'s style attribute changes (`syncWindowsAppearance` in the shell's
 *  `lib/preload-app.cjs` observes that attribute, `data-ds-dark-theme` and
 *  the <head> subtree) — see `applySettings`. */
const GLASS_KNOB_PROPERTIES = [
  '--dsh-glass-blur',
  '--dsh-glass-frost',
  '--dsh-glass-brightness-black',
  '--dsh-glass-brightness-white',
  '--dsh-glass-glow',
] as const

/** localStorage key carrying the layer enable flag. */
export const GLASS_ENABLED_KEY = 'dsh.catppuccin.glass.enabled'

/** Plugin identity stamped onto the lazily-mounted glass <style> tag (the
 *  shell's unload cleanup keys off `data-plugin`). */
const GLASS_STYLE_PLUGIN = '@nonamelego/dsh-catppuccin'
const GLASS_STYLE_TAG_ID = 'glass.module.css'

/** The lazily-mounted glass stylesheet <style> tag (undefined while the
 *  layer is off — item II: the glass CSS only enters the document while
 *  the glass layer is enabled, instead of being injected at plugin load). */
let glassStyleTag: HTMLStyleElement | null = null

/** Default state when nothing is stored yet: off (the stock UI stays stock). */
export const DEFAULT_ENABLED = DEFAULT_GLASS.enabled

/** Tunable glass knobs. */
export interface GlassSettings {
  /** Rendering mode: mica (frosted floating cards) or the stock layout with a generic glass material. */
  mode: 'mica' | 'compat'
  /** Glass backdrop blur radius, px. */
  blur: number
  /** Glass fill opacity, 0-100 (50 = the shipped look; drives the frost multiplier). */
  frost: number
  /** Backdrop brightness, 0-100 (0 = pure black, 50 = transparent, 100 = pure white; half-range per scheme). */
  brightness: number
  /**
   * Enable the two static ground glows (issue #26). OFF by default: the page
   * ground is the same-family WASH only, because the glows are fixed to screen
   * coordinates and every translucent pane therefore transmits a different
   * slice of them (measured: one sidebar card read ΔRGB (12,15,21) between its
   * own top and bottom with the glows on, ≤(4,4,5) with the wash alone — the
   * reporter's "三块玻璃读出三种底色"). The switch keeps the 0.6.3-beta.0 look
   * available on request instead of deleting it (issue #25 asked for it).
   */
  glow: boolean
}

/** The full state the settings row mirrors (settings + enable flag + scheme). */
export interface GlassRowState extends GlassSettings {
  /** Layer enable flag. */
  enabled: boolean
  /** Resolved palette is dark (the brightness knob darkens). */
  dark: boolean
}

/**
 * Shipped knob defaults — the knob-only view of `DEFAULT_GLASS` in
 * `src/state.ts` (the single source of truth, inlined into both bundles).
 * The shipped look aligns with the reference project
 * (DSH-Transparent-UI-Plugin / Aqua): mica mode, blur 5px, frost 20
 * (the 0-100 slider maps to a 0-1.4 alpha multiplier via frost/50, so 20
 * reads as a light frost) and neutral backdrop brightness.
 */
export const SETTINGS_DEFAULTS: GlassSettings = {
  mode: DEFAULT_GLASS.mode,
  blur: DEFAULT_GLASS.blur,
  frost: DEFAULT_GLASS.frost,
  brightness: DEFAULT_GLASS.brightness,
  glow: DEFAULT_GLASS.glow,
}

/** Numeric knob keys and their localStorage names. */
const NUMERIC_KEYS = {
  blur: 'dsh.catppuccin.glass.blur',
  frost: 'dsh.catppuccin.glass.frost',
  brightness: 'dsh.catppuccin.glass.brightness',
} as const
type NumericKey = keyof typeof NUMERIC_KEYS

/** The localStorage names of the numeric knobs — the reverse of
 *  `NUMERIC_KEYS`. Used by the cross-tab `storage` handler: the event's `key`
 *  is a localStorage name (`dsh.catppuccin.glass.blur`), so it must be matched
 *  against the VALUES, never with `key in NUMERIC_KEYS` (that tests the object's
 *  property names — `blur`/`frost`/`brightness` — and is false for every real
 *  storage key, which silently killed cross-tab knob sync; audit F1). */
const NUMERIC_STORAGE_KEYS: readonly string[] = Object.values(NUMERIC_KEYS)

const MODE_KEY = 'dsh.catppuccin.glass.mode'

/** localStorage key of the ground-glow switch (issue #26). */
const GLOW_KEY = 'dsh.catppuccin.glass.glow'

/** Clamp a numeric knob into its sane range. */
function clampSetting(key: NumericKey, value: number): number {
  const max = key === 'blur' ? 40 : 100
  return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : SETTINGS_DEFAULTS[key]
}

/** Read one numeric knob from localStorage (absent/parse failure means the default). */
function readSetting(key: NumericKey): number {
  try {
    const raw = localStorage.getItem(NUMERIC_KEYS[key])
    return raw === null ? SETTINGS_DEFAULTS[key] : clampSetting(key, Number(raw))
  } catch {
    return SETTINGS_DEFAULTS[key]
  }
}

/** Persist one numeric knob (storage failures keep the in-memory state). */
function writeSetting(key: NumericKey, value: number): void {
  try {
    localStorage.setItem(NUMERIC_KEYS[key], String(value))
  } catch {
    /* in-memory state still applies for this tab */
  }
}

/** Read the rendering mode ('mica' or 'compat'). */
function readMode(): 'mica' | 'compat' {
  try {
    return localStorage.getItem(MODE_KEY) === 'compat' ? 'compat' : 'mica'
  } catch {
    return 'mica'
  }
}

/** Persist the rendering mode. */
function writeMode(value: 'mica' | 'compat'): void {
  try {
    localStorage.setItem(MODE_KEY, value)
  } catch {
    /* in-memory state still applies */
  }
}

/** Read the persisted enable flag (absent storage means the default). */
function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(GLASS_ENABLED_KEY)
    return raw === null ? DEFAULT_ENABLED : raw === 'true'
  } catch {
    return DEFAULT_ENABLED
  }
}

/** Persist the enable flag (storage failures keep the in-memory state). */
function writeEnabled(value: boolean): void {
  try {
    localStorage.setItem(GLASS_ENABLED_KEY, String(value))
  } catch {
    /* in-memory state still applies for this tab */
  }
}

/** Read the ground-glow switch (absent storage means the shipped default: off). */
function readGlow(): boolean {
  try {
    const raw = localStorage.getItem(GLOW_KEY)
    return raw === null ? SETTINGS_DEFAULTS.glow : raw === 'true'
  } catch {
    return SETTINGS_DEFAULTS.glow
  }
}

/** Persist the ground-glow switch. */
function writeGlow(value: boolean): void {
  try {
    localStorage.setItem(GLOW_KEY, String(value))
  } catch {
    /* in-memory state still applies for this tab */
  }
}

/** Resolved scheme from the theme service (falls back to the body attribute). */
function resolveDark(ctx: Context): boolean {
  try {
    return ctx.theme.getTheme().active.colorScheme === 'dark'
  } catch {
    return document.body.hasAttribute('data-ds-dark-theme')
  }
}

/**
 * The page-edge fade bands injected while enabled (ported from
 * DSH-Transparent-UI-Plugin): two fixed-position, click-through strips
 * that blur the chat content melting into the viewport edges. Both are
 * removed together on disable. The page ground itself is pure CSS (the
 * body rule), so no backdrop element is needed.
 */
const FADE_MARKUP = [
  '<span data-dsh-glass-fade="top" aria-hidden="true"></span>',
  '<span data-dsh-glass-fade="bottom" aria-hidden="true"></span>',
].join('')

/**
 * Owns the glass layer lifecycle: reads the durable enable flag and knobs,
 * and applies / retracts every layer on change. Cross-tab flips arrive through
 * the storage event; the seam observer and every subscription are released
 * when the plugin fiber is disposed.
 */
export class GlassLayer {
  private enabled = false
  private settings: GlassSettings = { ...SETTINGS_DEFAULTS }
  /** Cached snapshot for the settings row (stable reference between changes). */
  private snapshot: GlassRowState
  private readonly listeners = new Set<() => void>()
  private dark = false
  private seamDisposer: (() => void) | undefined
  private readonly ctx: Context

  /**
   * @param ctx - owning client context (listeners ride this fiber).
   */
  constructor(ctx: Context) {
    this.ctx = ctx
    this.enabled = readEnabled()
    this.reloadSettings()
    this.dark = resolveDark(ctx)
    this.snapshot = this.buildSnapshot()

    ctx.effect(() => {
      const onStorage = (event: StorageEvent): void => {
        if (event.key === null) { this.reloadSettings(); this.enabled = readEnabled(); this.sync() }
        else if (event.key === GLASS_ENABLED_KEY) {
          this.enabled = readEnabled()
          this.sync()
        } else if (event.key === MODE_KEY || event.key === GLOW_KEY || NUMERIC_STORAGE_KEYS.includes(event.key)) {
          this.reloadSettings()
          if (this.enabled) this.applySettings()
          this.publish()
        }
      }
      window.addEventListener('storage', onStorage)
      // Follow the Appearance switch: the brightness knob's half-range and
      // the mix direction flip with the resolved scheme. Runs even while
      // disabled so the settings row stays correct.
      const themeListener = ctx.on('theme/change', () => {
        this.dark = resolveDark(ctx)
        if (this.enabled) this.applySettings()
        this.publish()
      })
      return () => {
        window.removeEventListener('storage', onStorage)
        themeListener()
        this.unmount()
      }
    }, 'catppuccin: glass layer lifecycle')

    // Apply the restored state: mount the layer when the persisted flag is on
    // (the settings row reflects the same snapshot, so the two stay in sync).
    this.sync()
  }

  /** Current state snapshot (stable reference until the next change). */
  getSnapshot(): GlassRowState {
    return this.snapshot
  }

  /** Subscribe to snapshot changes. Returns the disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The durable subset of the current layer state (no derived `dark`). */
  getRemoteState(): GlassState {
    return {
      enabled: this.enabled,
      mode: this.settings.mode,
      blur: this.settings.blur,
      frost: this.settings.frost,
      brightness: this.settings.brightness,
      glow: this.settings.glow,
    }
  }

  /** Overlay durable state hydrated from the Host file: persist it to
   *  localStorage (the cache), apply it to the live layer, and republish so
   *  the settings row reflects the restored choice. */
  applyRemote(remote: GlassState): void {
    this.enabled = remote.enabled
    this.settings = {
      mode: remote.mode === 'compat' ? 'compat' : 'mica',
      blur: clampSetting('blur', remote.blur),
      frost: clampSetting('frost', remote.frost),
      brightness: clampSetting('brightness', remote.brightness),
      glow: remote.glow === true,
    }
    writeEnabled(this.enabled)
    writeMode(this.settings.mode)
    writeSetting('blur', this.settings.blur)
    writeSetting('frost', this.settings.frost)
    writeSetting('brightness', this.settings.brightness)
    writeGlow(this.settings.glow)
    this.sync()
  }

  /** Flip the layer: persist, then apply or retract every owned effect. */
  setEnabled(value: boolean): void {
    if (value === this.enabled) return
    this.enabled = value
    writeEnabled(value)
    this.sync()
  }

  /** Set the rendering mode ('mica' or 'compat'). */
  setMode(value: 'mica' | 'compat'): void {
    if (value === this.settings.mode) return
    this.settings.mode = value
    writeMode(value)
    if (this.enabled) this.applySettings()
    this.publish()
  }

  /** Set the glass blur radius (px). */
  setBlur(value: number): void {
    const next = clampSetting('blur', value)
    if (next === this.settings.blur) return
    this.settings.blur = next
    writeSetting('blur', next)
    if (this.enabled) this.applySettings()
    this.publish()
  }

  /** Set the glass frost amount (0-100). */
  setFrost(value: number): void {
    const next = clampSetting('frost', value)
    if (next === this.settings.frost) return
    this.settings.frost = next
    writeSetting('frost', next)
    if (this.enabled) this.applySettings()
    this.publish()
  }

  /** Set the backdrop brightness (0-100: 0 = pure black, 50 = transparent, 100 = pure white). */
  setBrightness(value: number): void {
    const next = clampSetting('brightness', value)
    if (next === this.settings.brightness) return
    this.settings.brightness = next
    writeSetting('brightness', next)
    if (this.enabled) this.applySettings()
    this.publish()
  }

  /** Toggle the two static ground glows (issue #26; wash-only is the default). */
  setGlow(value: boolean): void {
    if (value === this.settings.glow) return
    this.settings.glow = value
    writeGlow(value)
    if (this.enabled) this.applySettings()
    this.publish()
  }

  /** Restore every knob to the shipped defaults (persisted immediately). */
  resetDefaults(): void {
    this.settings = { ...SETTINGS_DEFAULTS }
    writeMode(this.settings.mode)
    writeSetting('blur', this.settings.blur)
    writeSetting('frost', this.settings.frost)
    writeSetting('brightness', this.settings.brightness)
    writeGlow(this.settings.glow)
    if (this.enabled) this.applySettings()
    this.publish()
  }

  /** Re-read every knob from localStorage into memory. */
  private reloadSettings(): void {
    this.settings = {
      mode: readMode(),
      blur: readSetting('blur'),
      frost: readSetting('frost'),
      brightness: readSetting('brightness'),
      glow: readGlow(),
    }
  }

  private buildSnapshot(): GlassRowState {
    return { ...this.settings, enabled: this.enabled, dark: this.dark }
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private sync(): void {
    if (this.enabled) this.mount()
    else this.unmount()
    this.publish()
  }

  /** Write the knob-driven CSS variables and mode attributes onto <html>. */
  private applySettings(): void {
    const style = document.documentElement.style
    const dark = this.dark
    const knobs: Record<(typeof GLASS_KNOB_PROPERTIES)[number], string> = {
      '--dsh-glass-blur': `${this.settings.blur}px`,
      // Frost 0-100 → a 0-1.4 alpha multiplier (50 = 1x). Capped so max frost
      // stays translucent frosted glass instead of collapsing to a solid slab.
      '--dsh-glass-frost': String(Math.min(this.settings.frost / 50, 1.4)),
      // Backdrop brightness: dark mode darkens (0 = pure black, 50 = off),
      // light mode brightens (50 = off, 100 = pure white) — the knob's range
      // and the mix direction both follow the resolved scheme. The body
      // background rule mixes these fractions straight into the solid ground.
      '--dsh-glass-brightness-black': String(dark ? Math.max(0, (50 - this.settings.brightness) / 50) : 0),
      '--dsh-glass-brightness-white': String(dark ? 0 : Math.max(0, (this.settings.brightness - 50) / 50)),
      // Ground glows (issue #26): 1 = on, 0 = off. The stylesheet multiplies the
      // two radial layers' alpha by this, so the shipped ground is the wash alone
      // and the switch restores the 0.6.3-beta.0 look without editing the sheet.
      // The expression stays INLINE in the `background` declaration (the #25
      // invalidation trap): it is read directly there, never through a
      // intermediate custom property.
      '--dsh-glass-glow': this.settings.glow ? '1' : '0',
    }
    for (const [property, value] of Object.entries(knobs)) style.setProperty(property, value)

    // Rendering mode: the float rules key off data-dsh-glass-float; the
    // compat (generic glass) rules key off data-dsh-glass-compat.
    const compat = this.settings.mode === 'compat'
    document.documentElement.toggleAttribute(GLASS_FLOAT_ATTRIBUTE, !compat)
    document.documentElement.toggleAttribute(GLASS_COMPAT_ATTRIBUTE, compat)

    // Desktop caption sync (2026-10-16): the official shell re-reads its native
    // caption colour only when <body>'s style attribute (or the <head> subtree)
    // changes — and its first read happens when this plugin's <style> tag lands,
    // i.e. BEFORE the mode attributes above exist. Mirroring the knobs onto
    // <body> is therefore what makes that probe see the mica caption override at
    // mount time, and what carries a slider move to the title bar afterwards.
    // Same values as <html>'s, so nothing else in the page moves.
    const body = document.body
    if (body !== null) for (const [property, value] of Object.entries(knobs)) body.style.setProperty(property, value)
  }

  private mount(): void {
    this.ensureStyle()
    document.documentElement.setAttribute(GLASS_ATTRIBUTE, '')
    this.applySettings()
    this.ensureFades()
    if (this.seamDisposer === undefined) this.seamDisposer = startGlassSeamStamper()
  }

  private unmount(): void {
    document.documentElement.removeAttribute(GLASS_ATTRIBUTE)
    document.documentElement.removeAttribute(GLASS_FLOAT_ATTRIBUTE)
    document.documentElement.removeAttribute(GLASS_COMPAT_ATTRIBUTE)
    for (const node of document.querySelectorAll('[data-dsh-glass-fade]')) node.remove()
    this.seamDisposer?.()
    this.seamDisposer = undefined
    this.releaseStyle()
    // Drop the mirrored knobs too: with the mode attributes gone the caption
    // override no longer applies, and removing them from <body>'s style is what
    // makes the shell's caption observer re-read (and pick the theme's own
    // sidebar fill back up) instead of keeping the last mica colour.
    const body = document.body
    if (body !== null) for (const property of GLASS_KNOB_PROPERTIES) body.style.removeProperty(property)
  }

  /** Mount the glass stylesheet <style> tag (lazy — first enable only;
   *  re-append when toggling back on). The CSS text ships in the bundle as
   *  `GLASS_CSS_TEXT` (see `glass-css.gen.ts`), so no document work happens
   *  while the layer is off and only a detached/re-attached tag marks the
   *  on/off boundary after the first mount. */
  private ensureStyle(): void {
    if (glassStyleTag !== null) {
      document.head.append(glassStyleTag)
      return
    }
    const tag = document.createElement('style')
    tag.dataset.plugin = GLASS_STYLE_PLUGIN
    tag.dataset.pluginCss = GLASS_STYLE_TAG_ID
    tag.textContent = GLASS_CSS_TEXT
    document.head.append(tag)
    glassStyleTag = tag
  }

  /** Remove the lazily-mounted stylesheet tag (the layer's CSS leaves the
   *  document with it; the body attribute removal already made every rule
   *  inert). */
  private releaseStyle(): void {
    glassStyleTag?.remove()
    glassStyleTag = null
  }

  /** Insert the page-edge fade bands (or reuse the existing ones). */
  private ensureFades(): void {
    if (document.querySelector('[data-dsh-glass-fade]') !== null) return
    const holder = document.createElement('div')
    holder.innerHTML = FADE_MARKUP
    for (const node of Array.from(holder.children)) {
      if (node instanceof HTMLElement) document.body.append(node)
    }
  }
}
