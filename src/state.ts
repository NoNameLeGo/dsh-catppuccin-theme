/**
 * Durable Catppuccin state — the shared contract between the two halves.
 *
 * Why this exists: DSH Desktop launches `@deepseek-ai/dsh` with `--port 0`
 * (a fresh random loopback port every launch), and localStorage is scoped per
 * origin including the port. So a flavour/glass choice persisted only in
 * localStorage is silently lost on every Desktop restart — the GUI boots on a
 * brand-new origin where the storage is empty.
 *
 * Since 0.5.0 the DURABLE copy lives in the official settings seam
 * (`ctx.settings` Host-side / `ctx.settingsScope` Client-side), which
 * persists under the DSH home exactly like the legacy
 * `$DSH_HOME/catppuccin-state.json` did — port-independent, so it survives
 * the Desktop's per-launch port churn. The legacy file is kept as a
 * read-only migration source (`src/legacy-state.ts`) and rolled into the
 * settings document once (`src/index.ts`). Browser localStorage remains the
 * in-browser cache and cross-tab sync bus, and the Client's fallback when the
 * settings transport is unavailable. This module is dependency-free so both
 * bundles inline it (like `update-check.ts`).
 */
export const STATE_VERSION = 1

/** Settings namespace both halves address: Host registers it, Client binds
 *  it through `ctx.settingsScope` (see `src/settings-catppuccin.ts`). */
export const CATPPUCCIN_SETTINGS_NS = 'catppuccin'

/** State file name under the DSH home (kept next to the Desktop-managed
 *  `cordis.patch.yml` so it survives the Desktop's per-launch port churn). */
export const STATE_FILENAME = 'catppuccin-state.json'

/** The four registered Catppuccin theme ids. MUST stay in sync with the
 *  `themeId` of `CATPPUCCIN_FLAVORS` in `src/client/palettes.ts` — guarded by
 *  `tests/state.spec.ts` — because the persisted flavour value IS the theme id. */
export const CATPPUCCIN_THEME_IDS = [
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
] as const

/** A persisted flavour choice: one registered theme id or `off` (fall back to
 *  the official theme). */
export type FlavorValue = (typeof CATPPUCCIN_THEME_IDS)[number] | 'off'

/** Durable glass-layer settings (no derived `dark` field — that resolves at
 *  runtime from the active theme). */
export interface GlassState {
  /** Layer enable flag. */
  enabled: boolean
  /** Rendering mode. */
  mode: 'mica' | 'compat'
  /** Glass blur radius, px (0-40). */
  blur: number
  /** Glass fill frost, 0-100. */
  frost: number
  /** Backdrop brightness, 0-100. */
  brightness: number
}

/** The whole durable state the plugin persists. */
export interface CatppuccinState {
  /** Schema version; anything else is treated as unknown and defaulted. */
  version: typeof STATE_VERSION
  /** Selected flavour (theme id or `off`). */
  flavor: FlavorValue
  /** Glass-layer settings (enable flag + knobs). */
  glass: GlassState
}

/** The settings-document section: `CatppuccinState` minus the synthetic
 *  `version` field — the official seam resolves defaults, composition and the
 *  user layer itself, so no plugin-side version is stored. */
export interface CatppuccinSettingsSection {
  /** Selected flavour (theme id or `off`). */
  flavor: FlavorValue
  /** Glass-layer settings (enable flag + knobs). */
  glass: GlassState
}

/** Shipped glass defaults — the single source of truth; the client glass layer
 *  (`src/client/glass/glass-layer.ts`) derives its knob defaults from here. */
export const DEFAULT_GLASS: GlassState = {
  enabled: false,
  mode: 'mica',
  blur: 2,
  frost: 20,
  brightness: 50,
}

/** A fully default state: no Catppuccin flavour and no glass. */
export function defaultState(): CatppuccinState {
  return {
    version: STATE_VERSION,
    flavor: 'off',
    glass: { ...DEFAULT_GLASS },
  }
}

/** Clamp a finite number into [min, max]; non-finite values fall back. */
function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

/**
 * Normalize arbitrary input (JSON from disk or the wire) into a valid state:
 * unknown/missing fields fall back to defaults, out-of-range numbers clamp,
 * and unknown flavours/invalid enums fall back too. The Host applies this on
 * both read and write so a corrupt file or a hand-crafted payload can never
 * poison the plugin's settings.
 */
export function sanitizeState(input: unknown): CatppuccinState {
  const state = defaultState()
  if (typeof input !== 'object' || input === null) return state
  const raw = input as Record<string, unknown>

  const flavor = raw.flavor
  if (typeof flavor === 'string' && (CATPPUCCIN_THEME_IDS as readonly string[]).includes(flavor)) {
    state.flavor = flavor as FlavorValue
  } else if (flavor === 'off') {
    state.flavor = 'off'
  }

  const glass = typeof raw.glass === 'object' && raw.glass !== null
    ? raw.glass as Record<string, unknown>
    : {}
  state.glass.enabled = glass.enabled === true
  state.glass.mode = glass.mode === 'compat' ? 'compat' : 'mica'
  state.glass.blur = clampFinite(glass.blur, 0, 40, DEFAULT_GLASS.blur)
  state.glass.frost = clampFinite(glass.frost, 0, 100, DEFAULT_GLASS.frost)
  state.glass.brightness = clampFinite(glass.brightness, 0, 100, DEFAULT_GLASS.brightness)

  return state
}

/** Whether a normalized state carries nothing beyond the shipped defaults —
 *  i.e. the user never actually chose anything worth persisting. Used to tell
 *  "no durable state yet" apart from "an explicit default choice". */
export function isDefaultState(state: CatppuccinState): boolean {
  const expected = defaultState()
  return state.flavor === expected.flavor
    && state.glass.enabled === expected.glass.enabled
    && state.glass.mode === expected.glass.mode
    && state.glass.blur === expected.glass.blur
    && state.glass.frost === expected.glass.frost
    && state.glass.brightness === expected.glass.brightness
}

/** Default settings-document section: no flavour and no glass (mirrors
 *  `defaultState()` minus the synthetic `version`). */
export function defaultSettingsSection(): CatppuccinSettingsSection {
  return {
    flavor: 'off',
    glass: { ...DEFAULT_GLASS },
  }
}

/** Drop the synthetic `version` field: full state → settings-document section. */
export function settingsSectionFromState(state: CatppuccinState): CatppuccinSettingsSection {
  return {
    flavor: state.flavor,
    glass: { ...state.glass },
  }
}

/** Lift a settings-document section back into the full state-shaped contract
 *  (re-sanitized so a hand-edited document can never poison the plugin). */
export function stateFromSettingsSection(section: CatppuccinSettingsSection): CatppuccinState {
  return sanitizeState(section)
}

/** Whether two settings sections are field-for-field equal (used to skip
 *  redundant mirror writes and to recognize the Host echoing our own write). */
export function settingsSectionsEqual(a: CatppuccinSettingsSection, b: CatppuccinSettingsSection): boolean {
  return a.flavor === b.flavor
    && a.glass.enabled === b.glass.enabled
    && a.glass.mode === b.glass.mode
    && a.glass.blur === b.glass.blur
    && a.glass.frost === b.glass.frost
    && a.glass.brightness === b.glass.brightness
}
