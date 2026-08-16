/**
 * Catppuccin glass layer — one toggleable glassmorphism skin over the whole
 * Web surface, riding on top of the Catppuccin themes. Everything the layer
 * owns is an effect: the CSS hooks ride a `data-dsh-glass` attribute on
 * <html> (the stylesheet only applies under it), the seam stamps ride a
 * MutationObserver, and the ambient backdrop is a DOM element — so switching
 * the flag off (or unloading the plugin) restores the stock UI exactly: no
 * residue, no reload.
 *
 * The enable flag and every knob persist in localStorage: client-only visual
 * preferences (like the selected-session key), written and read by this
 * plugin alone, so the layer needs no host configuration.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the theme plugin's Context merge (ctx.theme + theme/change).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { startGlassSeamStamper } from './glass-seams.ts'

/** html attribute selecting the glass layer: CSS hooks and ambient effects. */
export const GLASS_ATTRIBUTE = 'data-dsh-glass'

/** html attribute selecting the mica (floating-card) layout rules. */
export const GLASS_FLOAT_ATTRIBUTE = 'data-dsh-glass-float'

/** html attribute selecting the compatibility (stock-layout) rules. */
export const GLASS_COMPAT_ATTRIBUTE = 'data-dsh-glass-compat'

/** localStorage key carrying the layer enable flag. */
export const GLASS_ENABLED_KEY = 'dsh.catppuccin.glass.enabled'

/** Default state when nothing is stored yet: off (the stock UI stays stock). */
export const DEFAULT_ENABLED = false

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
  /** Ambient hue shift, degrees. */
  hue: number
}

/** The full state the settings row mirrors (settings + enable flag + scheme). */
export interface GlassRowState extends GlassSettings {
  /** Layer enable flag. */
  enabled: boolean
  /** Resolved palette is dark (the brightness knob darkens). */
  dark: boolean
}

const SETTINGS_DEFAULTS: GlassSettings = {
  mode: 'mica',
  blur: 14,
  frost: 50,
  brightness: 50,
  hue: 0,
}

/** Numeric knob keys and their localStorage names. */
const NUMERIC_KEYS = {
  blur: 'dsh.catppuccin.glass.blur',
  frost: 'dsh.catppuccin.glass.frost',
  brightness: 'dsh.catppuccin.glass.brightness',
  hue: 'dsh.catppuccin.glass.hue',
} as const
type NumericKey = keyof typeof NUMERIC_KEYS

const MODE_KEY = 'dsh.catppuccin.glass.mode'

/** Clamp a numeric knob into its sane range. */
function clampSetting(key: NumericKey, value: number): number {
  const max = key === 'blur' ? 40
    : key === 'frost' || key === 'brightness' ? 100
      : 360
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
 * The ambient backdrop markup injected while enabled (CSS-only, no WebGL):
 * the living backdrop plus the two page-edge fade bands that blur the chat
 * content melting into the viewport edges (ported from
 * DSH-Transparent-UI-Plugin). All three are fixed-position, click-through,
 * and removed together on disable.
 */
const AMBIENT_MARKUP = [
  '<div data-dsh-glass-ambient aria-hidden="true">',
  '  <span data-dsh-glass-blob="1"></span>',
  '  <span data-dsh-glass-blob="2"></span>',
  '  <span data-dsh-glass-blob="3"></span>',
  '</div>',
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
      // the ambient direction flip with the resolved scheme. Runs even while
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

  /** Set the ambient hue shift (degrees). */
  setHue(value: number): void {
    const next = clampSetting('hue', value)
    if (next === this.settings.hue) return
    this.settings.hue = next
    writeSetting('hue', next)
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
      hue: readSetting('hue'),
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
    style.setProperty('--dsh-glass-hue', `${this.settings.hue}deg`)
    // Backdrop brightness: dark mode darkens (0 = pure black, 50 = off),
    // light mode brightens (50 = off, 100 = pure white) — the knob's range
    // and the overlay direction both follow the resolved scheme.
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
    this.ensureAmbient()
    if (this.seamDisposer === undefined) this.seamDisposer = startGlassSeamStamper()
  }

  private unmount(): void {
    document.documentElement.removeAttribute(GLASS_ATTRIBUTE)
    document.documentElement.removeAttribute(GLASS_FLOAT_ATTRIBUTE)
    document.documentElement.removeAttribute(GLASS_COMPAT_ATTRIBUTE)
    for (const node of document.querySelectorAll('[data-dsh-glass-ambient], [data-dsh-glass-fade]')) node.remove()
    this.seamDisposer?.()
    this.seamDisposer = undefined
  }

  /** Insert the ambient backdrop + edge fades (or reuse the existing ones). */
  private ensureAmbient(): void {
    if (document.querySelector('[data-dsh-glass-ambient]') !== null) return
    const holder = document.createElement('div')
    holder.innerHTML = AMBIENT_MARKUP
    for (const node of Array.from(holder.children)) {
      if (node instanceof HTMLElement) document.body.append(node)
    }
  }
}
