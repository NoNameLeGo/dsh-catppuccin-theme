/**
 * Catppuccin glass layer — one toggleable glassmorphism skin over the whole
 * Web surface, riding on top of the Catppuccin themes. Everything the layer
 * owns is an effect: the CSS hooks ride a `data-dsh-glass` attribute on
 * <html> (the stylesheet only applies under it), the seam stamps ride a
 * MutationObserver, and the page-edge fade bands are DOM elements — so
 * switching the flag off (or unloading the plugin) restores the stock UI
 * exactly: no residue, no reload.
 *
 * The page ground is a SOLID colour: the active theme's own `bg-base`
 * token (Latte / Frappé / Macchiato / Mocha), with the brightness knob
 * mixing white/black straight into it. The earlier animated ambient scene
 * (gradient wash + drifting blobs + hue rotation) was removed in favour of
 * this flat ground.
 *
 * The enable flag and every knob persist in localStorage — the in-browser
 * cache and cross-tab sync bus. The DURABLE copy of the same state lives in
 * the official settings document under the DSH home (namespace `catppuccin`,
 * see `src/state.ts` — the Host registers it, the Client binds it through
 * `ctx.settingsScope` and hydrates via `applyRemote` / `getRemoteState`):
 * required because DSH Desktop boots the GUI on a fresh random loopback port
 * every launch, and localStorage (scoped per origin including the port) always
 * starts empty there, while a file in the DSH home does not. On profiles
 * without a usable settings transport the layer simply keeps working from
 * localStorage alone. The enable flag and knobs themselves stay client-only
 * visual preferences shared with the plugin alone, needing no host
 * configuration.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the theme plugin's Context merge (ctx.theme + theme/change).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { startGlassSeamStamper } from './glass-seams.ts'
import { DEFAULT_GLASS, type GlassState } from '../../state.ts'

/** html attribute selecting the glass layer: CSS hooks and page effects. */
export const GLASS_ATTRIBUTE = 'data-dsh-glass'

/** html attribute selecting the mica (floating-card) layout rules. */
export const GLASS_FLOAT_ATTRIBUTE = 'data-dsh-glass-float'

/** html attribute selecting the compatibility (stock-layout) rules. */
export const GLASS_COMPAT_ATTRIBUTE = 'data-dsh-glass-compat'

/** localStorage key carrying the layer enable flag. */
export const GLASS_ENABLED_KEY = 'dsh.catppuccin.glass.enabled'

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
 * (DSH-Transparent-UI-Plugin / Aqua): mica mode, blur 2px, frost 20
 * (the 0-100 slider maps to a 0-1.4 alpha multiplier via frost/50, so 20
 * reads as a light frost) and neutral backdrop brightness.
 */
export const SETTINGS_DEFAULTS: GlassSettings = {
  mode: DEFAULT_GLASS.mode,
  blur: DEFAULT_GLASS.blur,
  frost: DEFAULT_GLASS.frost,
  brightness: DEFAULT_GLASS.brightness,
}

/** Numeric knob keys and their localStorage names. */
const NUMERIC_KEYS = {
  blur: 'dsh.catppuccin.glass.blur',
  frost: 'dsh.catppuccin.glass.frost',
  brightness: 'dsh.catppuccin.glass.brightness',
} as const
type NumericKey = keyof typeof NUMERIC_KEYS

const MODE_KEY = 'dsh.catppuccin.glass.mode'

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
        } else if (event.key === MODE_KEY || event.key in NUMERIC_KEYS) {
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
    }
    writeEnabled(this.enabled)
    writeMode(this.settings.mode)
    writeSetting('blur', this.settings.blur)
    writeSetting('frost', this.settings.frost)
    writeSetting('brightness', this.settings.brightness)
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

  /** Restore every knob to the shipped defaults (persisted immediately). */
  resetDefaults(): void {
    this.settings = { ...SETTINGS_DEFAULTS }
    writeMode(this.settings.mode)
    writeSetting('blur', this.settings.blur)
    writeSetting('frost', this.settings.frost)
    writeSetting('brightness', this.settings.brightness)
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
    style.setProperty('--dsh-glass-blur', `${this.settings.blur}px`)
    // Frost 0-100 → a 0-1.4 alpha multiplier (50 = 1x). Capped so max frost
    // stays translucent frosted glass instead of collapsing to a solid slab.
    style.setProperty('--dsh-glass-frost', String(Math.min(this.settings.frost / 50, 1.4)))
    // Backdrop brightness: dark mode darkens (0 = pure black, 50 = off),
    // light mode brightens (50 = off, 100 = pure white) — the knob's range
    // and the mix direction both follow the resolved scheme. The body
    // background rule mixes these fractions straight into the solid ground.
    const dark = this.dark
    style.setProperty('--dsh-glass-brightness-black', String(dark ? Math.max(0, (50 - this.settings.brightness) / 50) : 0))
    style.setProperty('--dsh-glass-brightness-white', String(dark ? 0 : Math.max(0, (this.settings.brightness - 50) / 50)))

    // Rendering mode: the float rules key off data-dsh-glass-float; the
    // compat (generic glass) rules key off data-dsh-glass-compat.
    const compat = this.settings.mode === 'compat'
    document.documentElement.toggleAttribute(GLASS_FLOAT_ATTRIBUTE, !compat)
    document.documentElement.toggleAttribute(GLASS_COMPAT_ATTRIBUTE, compat)
  }

  private mount(): void {
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
