/**
 * Durable Catppuccin state — the shared contract between the two halves.
 *
 * Why this exists: localStorage is scoped per origin, so it is the wrong place
 * for the ONLY copy of a preference. It is per-browser (two browsers on one
 * machine disagree), per-loopback-port (a second Desktop instance that lands
 * on the next free port gets a different origin — the official shell pins
 * `19387` and `anywhere-labs/dsh-desktop` starts at `43120` and increments on
 * a bind collision, both observed 2026-09-24), and it disappears whenever the
 * user clears site data. The durable copy lives in the official settings seam
 * under the DSH home, which is the machine-wide truth every browser and every
 * profile entry reads.
 *
 * (Historical note, corrected 2026-09-24: the 0.5.0 rationale claimed DSH
 * Desktop launched the profile with `--port 0`, "a fresh random port every
 * launch". That was already untrue when 0.5.0 shipped — the community shell
 * pinned a stable port on 2026-08-21, and the official shell passes an
 * explicit `--port 19387`. The design is unchanged and still justified by the
 * reasons above, but do not repeat the port-per-launch claim.)
 *
 * Since 0.5.0 the DURABLE copy lives in the official settings seam, which
 * persists under the DSH home exactly like the legacy
 * `$DSH_HOME/catppuccin-state.json` did — origin-independent, so it survives
 * the Desktop's per-launch port churn. The legacy file is kept as a
 * read-only migration source (`src/legacy-state.ts`) and rolled into the
 * settings document once (`src/index.ts`). Browser localStorage remains the
 * in-browser cache and cross-tab sync bus, and the Client's fallback when the
 * settings transport is unavailable. This module is dependency-free so both
 * bundles inline it (like `update-check.ts`).
 *
 * The seam itself is version-dependent (issue #15): DSH <= 0.1.6-alpha.2
 * serves a Client `ctx.settingsScope` bound to a namespace the plugin
 * registers itself (`CATPPUCCIN_SETTINGS_NS`), while >= 0.1.7-alpha.1 serves
 * `ctx.configForms` projecting the plugin's volatile `Config` form, keyed by
 * the PROFILE ENTRY ID (`CATPPUCCIN_ENTRY_ID`). Both are addressed from this
 * one contract (see `src/client/state-sync.ts`).
 */
export const STATE_VERSION = 1

/** Release channels the update check knows about (a persisted preference;
 *  `selectNewest` in `update-check.ts` consumes it). */
export type UpdateChannel = 'latest' | 'beta'

/** Shiki syntax-highlighting style variants (see `src/client/shiki-tokens.ts`). */
export type ShikiStyle = 'default' | 'italic-comments'

/** Legacy settings namespace (DSH <= 0.1.6-alpha.2): the Host registers it
 *  through `settings.installSection`, the Client binds it through
 *  `ctx.settingsScope` (see `src/settings-catppuccin.ts`). */
export const CATPPUCCIN_SETTINGS_NS = 'catppuccin'

/**
 * Profile entry id carrying the plugin (DSH >= 0.1.7-alpha.1): the settings
 * service projects our volatile `Config` into a form named by the ACTIVE
 * PROFILE ENTRY's id, so this constant is the new seam's namespace.
 *
 * It is a CONTRACT with `cordis.patch.yml`: the `insert` row whose `name` is
 * `@nonamelego/dsh-catppuccin` must keep `id: dsh-catppuccin`, because the
 * Client can only address the form by that id (asserted by
 * `tests/settings-seam.spec.ts`). A user who renames the entry loses the new
 * seam and degrades to localStorage-only — the legacy seam is unaffected,
 * since that namespace is registered by the plugin itself.
 */
export const CATPPUCCIN_ENTRY_ID = 'dsh-catppuccin'

/** State file name under the DSH home (kept next to the Desktop-managed
 *  `cordis.patch.yml` so it survives the Desktop's per-launch port churn). */
export const STATE_FILENAME = 'catppuccin-state.json'

/**
 * Whether a raw settings view carries a user layer at all.
 *
 * The two seams answer this differently and the difference is load-bearing
 * (issue #15): the NEW form's `user` is the profile patch's `override`, which
 * `configEditor.configuration()` defaults to `{}` — so "absent" arrives as an
 * EMPTY OBJECT, and `!== undefined` would be true forever. The LEGACY
 * document omits the field entirely when the document holds no such section,
 * so the old `!== undefined` test stays correct there. Callers must use the
 * predicate their channel defines (see `src/client/state-sync.ts`).
 * @param user - a snapshot's raw user layer.
 * @returns whether it holds at least one entry.
 */
export function hasUserLayerSection(user: unknown): boolean {
  return typeof user === 'object' && user !== null && !Array.isArray(user) && Object.keys(user).length > 0
}

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
  /**
   * The optional ground GLOWS (issue #26, 2026-10-16). The page ground is
   * always a same-family wash (the "C" answer to the reporter's report: the
   * wash gives the glass something to transmit without localising the
   * brightness); this knob adds back the two static radial glows that shipped
   * in 0.6.3-beta.0 (issue #25) for users who liked them.
   *
   * Default OFF, and that default IS the reported fix: the glows are fixed to
   * screen coordinates while the glass panes sit elsewhere, so each pane
   * transmits a different slice of them — measured on the live page, one
   * sidebar card read ΔRGB (12,15,21) between its own top and bottom with the
   * glows on, and ≤(4,4,5) with the wash alone (see
   * `docs/issue-26-ambient-ground.md` / the CHANGELOG entry). The knob exists
   * because #25 was filed by the same reporter: rather than deleting the look
   * outright, it stays an opt-in.
   */
  glow: boolean
}

/** The whole durable state the plugin persists. */
export interface CatppuccinState {
  /** Schema version; anything else is treated as unknown and defaulted. */
  version: typeof STATE_VERSION
  /** Selected flavour (theme id or `off`). */
  flavor: FlavorValue
  /** Glass-layer settings (enable flag + knobs). */
  glass: GlassState
  /** Automatically re-check for updates (boot + periodic, while on). */
  autoCheck: boolean
  /** Release channel the update check chases. */
  updateChannel: UpdateChannel
  /** Per-token `--dsw-*` overrides merged LAST into the active theme. */
  overrides: Record<string, string>
  /** Shiki syntax-highlighting style variant. */
  shikiStyle: ShikiStyle
}

/** The settings-document section: `CatppuccinState` minus the synthetic
 *  `version` field — the official seam resolves defaults, composition and the
 *  user layer itself, so no plugin-side version is stored. */
export interface CatppuccinSettingsSection {
  /** Selected flavour (theme id or `off`). */
  flavor: FlavorValue
  /** Glass-layer settings (enable flag + knobs). */
  glass: GlassState
  /** Automatically re-check for updates (boot + periodic, while on). */
  autoCheck: boolean
  /** Release channel the update check chases. */
  updateChannel: UpdateChannel
  /** Per-token `--dsw-*` overrides merged LAST into the active theme. */
  overrides: Record<string, string>
  /** Shiki syntax-highlighting style variant. */
  shikiStyle: ShikiStyle
}

/** Shipped glass defaults — the single source of truth; the client glass layer
 *  (`src/client/glass/glass-layer.ts`) derives its knob defaults from here. */
export const DEFAULT_GLASS: GlassState = {
  enabled: false,
  mode: 'mica',
  blur: 5,
  frost: 20,
  brightness: 50,
  glow: false,
}

/** Shipped update-check preference: automatic checks on. */
export const DEFAULT_AUTO_CHECK = true
/** Shipped update-check channel: chase the stable `latest` tag. */
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'latest'
/** Shipped syntax-highlighting style. */
export const DEFAULT_SHIKI_STYLE: ShikiStyle = 'default'

/** A fully default state: no Catppuccin flavour and no glass. */
export function defaultState(): CatppuccinState {
  return {
    version: STATE_VERSION,
    flavor: 'off',
    glass: { ...DEFAULT_GLASS },
    autoCheck: DEFAULT_AUTO_CHECK,
    updateChannel: DEFAULT_UPDATE_CHANNEL,
    overrides: {},
    shikiStyle: DEFAULT_SHIKI_STYLE,
  }
}

/**
 * Keep only well-formed custom token overrides: string values under a `--`
 * key (the token shape `--dsw-*` names). Everything else is dropped so a
 * hand-edited document can never smuggle junk into the theme registration.
 */
export function sanitizeOverrides(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof input !== 'object' || input === null) return out
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && key.startsWith('--')) out[key] = value
  }
  return out
}

/**
 * Whether a raw overrides map carries entries {@link sanitizeOverrides} would
 * drop — a key that is not a `--` token, or a non-string value.
 *
 * The settings-document schema types `overrides` as a dict of strings only, so
 * a hand-edited document can hold such entries. The client reads them away but
 * never wrote the cleaned map back, so every settings publish re-ran the
 * "document wins" adoption for a difference nothing could clear (audit F7).
 * The caller uses this to push the sanitized shape back once, so the document
 * converges instead of drifting forever.
 */
export function hasUnpersistableOverrides(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  return Object.entries(raw).some(([key, value]) => typeof value !== 'string' || !key.startsWith('--'))
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
  // Issue #26: boolean-only, shipped OFF (the wash-only ground is the fix).
  state.glass.glow = glass.glow === true

  // Preference fields: absent values keep their shipped defaults, so a v1
  // document (predating them) rolls forward without a migration step.
  state.autoCheck = raw.autoCheck !== false
  state.updateChannel = raw.updateChannel === 'beta' ? 'beta' : 'latest'
  state.overrides = sanitizeOverrides(raw.overrides)
  state.shikiStyle = raw.shikiStyle === 'italic-comments' ? 'italic-comments' : 'default'

  return state
}

/**
 * Version-aware migration of an arbitrary persisted document. Version 1
 * documents roll forward through `sanitizeState` (every field added since
 * v1 has a sanitize-time default, so no structural step exists yet); future
 * versions chain their steps here, oldest first. Documents from a NEWER
 * plugin keep every field `sanitizeState` understands instead of being
 * nuked — a downgrade never destroys user state. The version-upgrade
 * convention lives in `docs/state-migrations.md` (item Y).
 */
export function migrate(raw: unknown): CatppuccinState {
  if (typeof raw !== 'object' || raw === null) return defaultState()
  const record = raw as Record<string, unknown>
  const version = typeof record.version === 'number' ? record.version : 1
  // Future schema steps chain here, oldest first:
  //   let current: unknown = record
  //   if (version < 2) current = migrateV1toV2(current)
  //   if (version < 3) current = migrateV2toV3(current)
  // (the state contract of each step is spelled out in docs/state-migrations.md)
  return sanitizeState(record)
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
    && state.glass.glow === expected.glass.glow
    && state.autoCheck === expected.autoCheck
    && state.updateChannel === expected.updateChannel
    && Object.keys(state.overrides).length === 0
    && state.shikiStyle === expected.shikiStyle
}

/** Default settings-document section: no flavour and no glass (mirrors
 *  `defaultState()` minus the synthetic `version`). */
export function defaultSettingsSection(): CatppuccinSettingsSection {
  return {
    flavor: 'off',
    glass: { ...DEFAULT_GLASS },
    autoCheck: DEFAULT_AUTO_CHECK,
    updateChannel: DEFAULT_UPDATE_CHANNEL,
    overrides: {},
    shikiStyle: DEFAULT_SHIKI_STYLE,
  }
}

/** Drop the synthetic `version` field: full state → settings-document section. */
export function settingsSectionFromState(state: CatppuccinState): CatppuccinSettingsSection {
  return {
    flavor: state.flavor,
    glass: { ...state.glass },
    autoCheck: state.autoCheck,
    updateChannel: state.updateChannel,
    overrides: { ...state.overrides },
    shikiStyle: state.shikiStyle,
  }
}

/** Lift a settings-document section back into the full state-shaped contract
 *  (re-sanitized so a hand-edited document can never poison the plugin). */
export function stateFromSettingsSection(section: CatppuccinSettingsSection): CatppuccinState {
  return sanitizeState(section)
}

/** Field-for-field equality of two override maps — the same rule
 *  {@link settingsSectionsEqual} applies to them (both directions, so a key
 *  that only one side holds makes them differ). */
export function sameOverrides(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key])
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
    && a.glass.glow === b.glass.glow
    && a.autoCheck === b.autoCheck
    && a.updateChannel === b.updateChannel
    && a.shikiStyle === b.shikiStyle
    && sameOverrides(a.overrides, b.overrides)
}

/**
 * Replay the local changes a window made BEFORE the durable channel became
 * usable onto the document state — the issue #30 fix.
 *
 * The R2 mechanism (`pendingLocalPush` in `src/client/index.ts`) exists so a
 * change made during the boot window is not rolled back by the first snapshot
 * the settings scope resolves. It used to replay the WHOLE local state, and on
 * a fresh origin (empty localStorage: a new port, a cleared site, a webview
 * partition) "the whole local state" is nothing but the shipped defaults — so
 * the first snapshot rewrote the document to `flavor: off`, `glass.enabled:
 * false`, `mode: mica`. The trigger is not even a user action: the glass layer
 * republishes on every `theme/change`, and `ui-theme` adopts its preference on
 * every boot.
 *
 * This replays only the fields whose value moved away from `baseline` — the
 * local section as of the last moment the window knew it was in sync with the
 * document (boot, or the last adoption / successful write). Everything else
 * keeps the document's value, and `changed === false` tells the caller to take
 * the ordinary "document wins" adoption path instead of writing anything.
 *
 * ⚠️ Every field of {@link CatppuccinSettingsSection} must be carried here.
 * A missing one is SILENT in both directions — a boot-window change to it is
 * dropped, and (because the caller's whole-state fallback is gone) nothing
 * else would notice. Same rule as `stateToMutateOps` (issue #26), and
 * `tests/state.spec.ts` holds a drift guard that fails when a field is added
 * without a mutant here.
 *
 * Known gap (accepted): a delta cannot tell "untouched" from "explicitly set
 * to the current default", so setting a field BACK to its default value inside
 * the boot window yields to the document. The window is sub-second and the
 * direction is "document wins", i.e. no durable data is lost.
 *
 * @param document - the section the settings document resolved (wins).
 * @param baseline - the local section at the last sync point.
 * @param local - the local section right now.
 * @returns the merged state plus whether anything actually differed.
 */
export function replayLocalChanges(
  document: CatppuccinState,
  baseline: CatppuccinSettingsSection,
  local: CatppuccinSettingsSection,
): { state: CatppuccinState; changed: boolean } {
  // A fresh section (glass/overrides cloned) so the caller's document state is
  // never mutated in place.
  const merged = settingsSectionFromState(document)
  let changed = false
  const carry = <K extends 'flavor' | 'autoCheck' | 'updateChannel' | 'shikiStyle'>(key: K): void => {
    if (local[key] !== baseline[key]) {
      merged[key] = local[key]
      changed = true
    }
  }
  const carryGlass = <K extends keyof GlassState>(key: K): void => {
    if (local.glass[key] !== baseline.glass[key]) {
      merged.glass[key] = local.glass[key]
      changed = true
    }
  }
  carry('flavor')
  carryGlass('enabled')
  carryGlass('mode')
  carryGlass('blur')
  carryGlass('frost')
  carryGlass('brightness')
  carryGlass('glow')
  carry('autoCheck')
  carry('updateChannel')
  carry('shikiStyle')
  // The override map is carried as a WHOLE map: a per-key replay cannot express
  // a removal (the local map simply lacks the key), and the boot window is far
  // too short for two windows to edit different tokens inside it.
  if (!sameOverrides(local.overrides, baseline.overrides)) {
    merged.overrides = { ...local.overrides }
    changed = true
  }
  return { state: sanitizeState(merged), changed }
}
