/**
 * Durable Catppuccin state — the shared contract between the two halves.
 *
 * Why this exists: DSH Desktop launches `@deepseek-ai/dsh` with `--port 0`
 * (a fresh random loopback port every launch), and localStorage is scoped per
 * origin including the port. So a flavour/glass choice persisted only in
 * localStorage is silently lost on every Desktop restart — the GUI boots on a
 * brand-new origin where the storage is empty. The other Desktop surfaces that
 * DO persist (the skin centre's active choice) are written by the host to a
 * file under the DSH home (`cordis.patch.yml`), which is port-independent.
 *
 * The fix mirrors that proven pattern: the Host keeps a tiny JSON file at
 * `$DSH_HOME/catppuccin-state.json`, and the Client reads/updates it through
 * two same-origin webServer routes (exactly the update-check pattern). The
 * file is the source of truth; browser localStorage stays as the instant
 * in-browser cache and cross-tab sync. This module is dependency-free so both
 * bundles inline it (like `update-check.ts`).
 */
export const STATE_VERSION = 1

/** Host route answering the durable state (GET reads, PUT writes). */
export const STATE_ROUTE_PATH = '/catppuccin/state'

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

/** Shipped glass defaults — aligned with `SETTINGS_DEFAULTS` in
 *  `src/client/glass/glass-layer.ts` (guarded by `tests/state.spec.ts`). */
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
