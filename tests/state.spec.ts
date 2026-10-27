// @vitest-environment jsdom
/**
 * Durable state contract — the shared shape, the sanitization/clamping rules,
 * the settings-document section helpers (0.5.0), and the sync guard that keeps
 * `src/state.ts` aligned with the client's registered flavour ids (the glass
 * knob defaults are derived from `DEFAULT_GLASS` directly, so no guard is
 * needed). A drift here would resurface the Desktop "theme does not stick
 * across restart" bug as restored but wrong values (the durable document is
 * the source of truth on every boot).
 */
import { describe, expect, it } from 'vitest'
import {
  CATPPUCCIN_THEME_IDS,
  CATPPUCCIN_SETTINGS_NS,
  DEFAULT_GLASS,
  STATE_FILENAME,
  STATE_VERSION,
  defaultSettingsSection,
  defaultState,
  hasUnpersistableOverrides,
  isDefaultState,
  migrate,
  replayLocalChanges,
  sanitizeOverrides,
  sanitizeState,
  settingsSectionFromState,
  settingsSectionsEqual,
  stateFromSettingsSection,
  type CatppuccinSettingsSection,
} from '../src/state.ts'
import { CATPPUCCIN_FLAVORS } from '../src/client/palettes.ts'
import { CATPPUCCIN_FLAVOR_VALUES } from '../src/client/index.ts'

describe('durable state defaults', () => {
  it('defaults to no Catppuccin flavour, no glass, auto-check on, stable channel', () => {
    expect(defaultState()).toEqual({
      version: STATE_VERSION,
      flavor: 'off',
      glass: {
        enabled: false,
        mode: 'mica',
        blur: 5,
        frost: 20,
        brightness: 50,
        glow: false,
      },
      autoCheck: true,
      updateChannel: 'latest',
      overrides: {},
      shikiStyle: 'default',
    })
  })

  it('isDefaultState only accepts a fully default state', () => {
    expect(isDefaultState(defaultState())).toBe(true)
    expect(isDefaultState(sanitizeState({ flavor: 'catppuccin-mocha' }))).toBe(false)
    expect(isDefaultState(sanitizeState({ glass: { enabled: true } }))).toBe(false)
    expect(isDefaultState(sanitizeState({ glass: { blur: 10 } }))).toBe(false)
    expect(isDefaultState(sanitizeState({ autoCheck: false }))).toBe(false)
    expect(isDefaultState(sanitizeState({ updateChannel: 'beta' }))).toBe(false)
    expect(isDefaultState(sanitizeState({ overrides: { '--dsw-static-blue-500': '#89b4fa' } }))).toBe(false)
    expect(isDefaultState(sanitizeState({ shikiStyle: 'italic-comments' }))).toBe(false)
  })

  it('uses the settled namespace and the legacy file name for migration', () => {
    expect(CATPPUCCIN_SETTINGS_NS).toBe('catppuccin')
    expect(STATE_FILENAME).toBe('catppuccin-state.json')
  })
})

describe('sanitizeState', () => {
  it('falls back to the default for absent or non-object input', () => {
    for (const input of [undefined, null, 1, 'x', [], false]) {
      expect(sanitizeState(input)).toEqual(defaultState())
    }
  })

  it('keeps a known flavour and off, and rejects unknown ones', () => {
    for (const flavor of CATPPUCCIN_THEME_IDS) {
      expect(sanitizeState({ flavor }).flavor).toBe(flavor)
    }
    expect(sanitizeState({ flavor: 'off' }).flavor).toBe('off')
    expect(sanitizeState({ flavor: 'mocha' }).flavor).toBe('off')
    expect(sanitizeState({ flavor: 5 }).flavor).toBe('off')
  })

  it('clamps out-of-range knobs and defaults non-numeric ones', () => {
    const glass = sanitizeState({ glass: { blur: 999, frost: -5, brightness: 'x' } }).glass
    expect(glass.blur).toBe(40)
    expect(glass.frost).toBe(0)
    expect(glass.brightness).toBe(50)
    expect(sanitizeState({ glass: {} }).glass).toEqual(DEFAULT_GLASS)
  })

  it('keeps the glow switch boolean-only and OFF by default (issue #26)', () => {
    expect(sanitizeState({ glass: {} }).glass.glow).toBe(false)
    expect(sanitizeState({ glass: { glow: 'true' } }).glass.glow).toBe(false)
    expect(sanitizeState({ glass: { glow: true } }).glass.glow).toBe(true)
  })

  it('keeps the layer flag and mode boolean/enum-only', () => {
    expect(sanitizeState({ glass: { enabled: 'true' } }).glass.enabled).toBe(false)
    expect(sanitizeState({ glass: { enabled: true } }).glass.enabled).toBe(true)
    expect(sanitizeState({ glass: { mode: 'compat' } }).glass.mode).toBe('compat')
    expect(sanitizeState({ glass: { mode: 'weird' } }).glass.mode).toBe('mica')
  })

  it('defaults the preference fields and accepts only their enum values', () => {
    expect(sanitizeState({}).autoCheck).toBe(true)
    expect(sanitizeState({ autoCheck: true }).autoCheck).toBe(true)
    expect(sanitizeState({ autoCheck: false }).autoCheck).toBe(false)
    expect(sanitizeState({ autoCheck: 'false' }).autoCheck).toBe(true) // non-boolean → default
    expect(sanitizeState({}).updateChannel).toBe('latest')
    expect(sanitizeState({ updateChannel: 'beta' }).updateChannel).toBe('beta')
    expect(sanitizeState({ updateChannel: 'canary' }).updateChannel).toBe('latest')
    expect(sanitizeState({}).shikiStyle).toBe('default')
    expect(sanitizeState({ shikiStyle: 'italic-comments' }).shikiStyle).toBe('italic-comments')
    expect(sanitizeState({ shikiStyle: 'rainbow' }).shikiStyle).toBe('default')
  })

  it('keeps only string values under -- prefixed keys in overrides', () => {
    expect(sanitizeState({ overrides: { '--dsw-static-blue-500': '#89b4fa', '--x': 1, plain: '#000', '--empty': '' } }).overrides)
      .toEqual({ '--dsw-static-blue-500': '#89b4fa', '--empty': '' })
    expect(sanitizeState({ overrides: 'junk' }).overrides).toEqual({})
    expect(sanitizeState({}).overrides).toEqual({})
  })

  it('is idempotent — sanitizing a sanitized state changes nothing', () => {
    const once = sanitizeState({
      flavor: 'catppuccin-latte',
      glass: { enabled: true, blur: 9 },
      autoCheck: false,
      updateChannel: 'beta',
      overrides: { '--dsw-static-blue-500': '#89b4fa' },
      shikiStyle: 'italic-comments',
    })
    expect(sanitizeState(once)).toEqual(once)
  })
})

describe('migrate (item Y)', () => {
  it('defaults non-object input', () => {
    for (const input of [undefined, null, 42, 'x']) {
      expect(migrate(input)).toEqual(defaultState())
    }
  })

  it('rolls a v1 document forward with the new fields defaulted', () => {
    const migrated = migrate({ version: 1, flavor: 'catppuccin-mocha', glass: { enabled: true, frosted: 'typo', blur: 30 } })
    expect(migrated.version).toBe(STATE_VERSION)
    expect(migrated.flavor).toBe('catppuccin-mocha')
    expect(migrated.glass.enabled).toBe(true)
    expect(migrated.glass.blur).toBe(30)
    expect(migrated.glass.frost).toBe(DEFAULT_GLASS.frost) // unknown key defaulted
    expect(migrated.autoCheck).toBe(true)
    expect(migrated.updateChannel).toBe('latest')
    expect(migrated.overrides).toEqual({})
    expect(migrated.shikiStyle).toBe('default')
  })

  it('a version-less document is treated as v1', () => {
    expect(migrate({ flavor: 'catppuccin-frappe' }).flavor).toBe('catppuccin-frappe')
  })

  it('a document from a NEWER plugin keeps every understood field (no nuke on downgrade)', () => {
    const migrated = migrate({ version: 99, flavor: 'catppuccin-latte', autoCheck: false })
    expect(migrated.flavor).toBe('catppuccin-latte')
    expect(migrated.autoCheck).toBe(false)
  })
})

describe('durable vs client sync guards', () => {
  it('the persisted flavour values equal the registered theme ids plus off', () => {
    expect(CATPPUCCIN_THEME_IDS).toEqual(CATPPUCCIN_FLAVORS.map((f) => f.themeId))
    expect(CATPPUCCIN_THEME_IDS).toEqual(CATPPUCCIN_FLAVOR_VALUES.filter((v) => v !== 'off'))
  })

})

describe('settings-document section helpers (0.5.0)', () => {
  it('defaultSettingsSection mirrors defaultState minus the synthetic version', () => {
    const { version, ...withoutVersion } = { ...defaultState(), version: undefined as never }
    expect(defaultSettingsSection()).toEqual({
      flavor: 'off',
      glass: { ...DEFAULT_GLASS },
      autoCheck: true,
      updateChannel: 'latest',
      overrides: {},
      shikiStyle: 'default',
    })
    expect(withoutVersion).not.toHaveProperty('version')
  })

  it('settingsSectionFromState drops the version and copies the glass knobs', () => {
    const state = sanitizeState({
      flavor: 'catppuccin-frappe',
      glass: { enabled: true, blur: 9 },
      updateChannel: 'beta',
      overrides: { '--dsw-static-blue-500': '#89b4fa' },
    })
    const section = settingsSectionFromState(state)
    expect(section).toEqual({
      flavor: 'catppuccin-frappe',
      glass: state.glass,
      autoCheck: true,
      updateChannel: 'beta',
      overrides: { '--dsw-static-blue-500': '#89b4fa' },
      shikiStyle: 'default',
    })
    expect(section).not.toHaveProperty('version')
    // The returned glass is a detached copy — mutating it cannot move state.
    section.glass.blur = 77
    expect(state.glass.blur).toBe(9)
  })

  it('stateFromSettingsSection re-sanitizes a document section into full state', () => {
    const section = settingsSectionFromState(sanitizeState({
      flavor: 'catppuccin-macchiato',
      glass: { blur: 3 },
      autoCheck: false,
      shikiStyle: 'italic-comments',
    }))
    const state = stateFromSettingsSection(section)
    expect(state.version).toBe(STATE_VERSION)
    expect(state.flavor).toBe('catppuccin-macchiato')
    expect(state.glass.blur).toBe(3)
    expect(state.autoCheck).toBe(false)
    expect(state.shikiStyle).toBe('italic-comments')
    // Hand-edited garbage is clamped back to sane values.
    expect(stateFromSettingsSection({ flavor: 'garbage', glass: { blur: 9999 } } as never).flavor).toBe('off')
    expect(stateFromSettingsSection({ flavor: 'garbage', glass: { blur: 9999 } } as never).glass.blur).toBe(40)
  })

  it('settingsSectionsEqual compares every field', () => {
    const base = defaultSettingsSection()
    expect(settingsSectionsEqual(base, defaultSettingsSection())).toBe(true)
    expect(settingsSectionsEqual(base, { ...base, flavor: 'catppuccin-latte' })).toBe(false)
    expect(settingsSectionsEqual(base, { ...base, glass: { ...base.glass, blur: 10 } })).toBe(false)
    expect(settingsSectionsEqual(base, { ...base, autoCheck: false })).toBe(false)
    expect(settingsSectionsEqual(base, { ...base, updateChannel: 'beta' })).toBe(false)
    expect(settingsSectionsEqual(base, { ...base, shikiStyle: 'italic-comments' })).toBe(false)
    expect(settingsSectionsEqual(base, { ...base, overrides: { '--dsw-static-blue-500': '#89b4fa' } })).toBe(false)
    expect(settingsSectionsEqual(
      { ...base, overrides: { '--a': '1', '--b': '2' } },
      { ...base, overrides: { '--b': '2', '--a': '1' } },
    )).toBe(true)
  })
})

describe('hasUnpersistableOverrides (audit F7)', () => {
  // The settings schema types the map as a dict of strings, so a hand-edited
  // document can hold keys `sanitizeOverrides` drops. The client reads them
  // away but never wrote the cleaned map back, so every publish re-ran the
  // "document wins" adoption for a difference nothing could clear.
  it('flags anything sanitizeOverrides would drop', () => {
    expect(hasUnpersistableOverrides(undefined)).toBe(false)
    expect(hasUnpersistableOverrides({})).toBe(false)
    expect(hasUnpersistableOverrides({ '--dsw-static-blue-500': '#89b4fa' })).toBe(false)
    expect(hasUnpersistableOverrides({ 'dsw-static-blue-500': '#89b4fa' })).toBe(true)
    expect(hasUnpersistableOverrides({ '--dsw-static-blue-500': 42 })).toBe(true)
    expect(hasUnpersistableOverrides({ '--ok': '1', nope: '2' })).toBe(true)
  })

  it('is consistent with what sanitizeOverrides keeps', () => {
    const mixed = { '--keep': '#fff', drop: '#000' }
    expect(hasUnpersistableOverrides(mixed)).toBe(true)
    expect(sanitizeOverrides(mixed)).toEqual({ '--keep': '#fff' })
    const clean = sanitizeOverrides(mixed)
    expect(hasUnpersistableOverrides(clean)).toBe(false)
  })
})

describe('replayLocalChanges (issue #30)', () => {
  // The reported bug: a fresh origin (empty localStorage — a new port, cleared
  // site data, a webview partition) queues a persist before the settings
  // document is readable, and the first usable snapshot replayed the whole
  // local state over it. On such an origin that state is nothing but the
  // shipped defaults ⇒ the document became `flavor: off` / glass off / mica.
  const documentSection: CatppuccinSettingsSection = {
    flavor: 'catppuccin-frappe',
    glass: { enabled: true, mode: 'compat', blur: 12, frost: 33, brightness: 77, glow: true },
    autoCheck: false,
    updateChannel: 'beta',
    overrides: { '--dsw-static-blue-500': '#89b4fa' },
    shikiStyle: 'italic-comments',
  }
  const documentState = stateFromSettingsSection(documentSection)

  it('replays nothing when the local section never moved off the baseline', () => {
    const replayed = replayLocalChanges(documentState, defaultSettingsSection(), defaultSettingsSection())
    expect(replayed.changed).toBe(false)
    expect(replayed.state).toEqual(documentState)
  })

  it('replays only the flavour picked during the boot window', () => {
    const baseline = defaultSettingsSection()
    const local = { ...baseline, flavor: 'catppuccin-mocha' as const }
    const replayed = replayLocalChanges(documentState, baseline, local)
    expect(replayed.changed).toBe(true)
    expect(replayed.state.flavor).toBe('catppuccin-mocha')
    expect(replayed.state.glass).toEqual(documentSection.glass)
    expect(replayed.state.overrides).toEqual(documentSection.overrides)
    expect(replayed.state.autoCheck).toBe(documentSection.autoCheck)
  })

  it('replays only the glass knobs and keeps the document flavour', () => {
    const baseline = defaultSettingsSection()
    const local = { ...baseline, glass: { ...baseline.glass, enabled: true, mode: 'compat' as const } }
    const replayed = replayLocalChanges(documentState, baseline, local)
    expect(replayed.changed).toBe(true)
    // Per KNOB, not per glass block: only the two that moved are carried, the
    // document's blur / frost / brightness / glow survive.
    expect(replayed.state.glass).toEqual({
      ...documentSection.glass,
      enabled: true,
      mode: 'compat',
    })
    expect(replayed.state.flavor).toBe('catppuccin-frappe')
    expect(replayed.state.shikiStyle).toBe('italic-comments')
  })

  it('carries the override map as a whole map', () => {
    const baseline = defaultSettingsSection()
    const local = { ...baseline, overrides: { '--dsw-static-blue-500': '#cba6f7' } }
    const replayed = replayLocalChanges(documentState, baseline, local)
    expect(replayed.changed).toBe(true)
    expect(replayed.state.overrides).toEqual({ '--dsw-static-blue-500': '#cba6f7' })
    // An unchanged map is not a change, even when the document's differs.
    const same = replayLocalChanges(documentState, baseline, { ...baseline })
    expect(same.changed).toBe(false)
    expect(same.state.overrides).toEqual(documentSection.overrides)
  })

  it('leaves the document state it was handed untouched', () => {
    const baseline = defaultSettingsSection()
    const local = { ...baseline, glass: { ...baseline.glass, blur: 40 } }
    expect(replayLocalChanges(documentState, baseline, local).changed).toBe(true)
    expect(documentState.glass.blur).toBe(12)
  })

  it('matches every document field when nothing moved, and carries every moved one (drift guard)', () => {
    const baseline = defaultSettingsSection()
    const mutants: Record<string, (section: CatppuccinSettingsSection) => CatppuccinSettingsSection> = {
      flavor: (s) => ({ ...s, flavor: 'catppuccin-mocha' }),
      'glass.enabled': (s) => ({ ...s, glass: { ...s.glass, enabled: true } }),
      'glass.mode': (s) => ({ ...s, glass: { ...s.glass, mode: 'compat' } }),
      'glass.blur': (s) => ({ ...s, glass: { ...s.glass, blur: 40 } }),
      'glass.frost': (s) => ({ ...s, glass: { ...s.glass, frost: 90 } }),
      'glass.brightness': (s) => ({ ...s, glass: { ...s.glass, brightness: 100 } }),
      'glass.glow': (s) => ({ ...s, glass: { ...s.glass, glow: true } }),
      autoCheck: (s) => ({ ...s, autoCheck: false }),
      updateChannel: (s) => ({ ...s, updateChannel: 'beta' }),
      overrides: (s) => ({ ...s, overrides: { '--dsw-static-blue-500': '#cba6f7' } }),
      shikiStyle: (s) => ({ ...s, shikiStyle: 'italic-comments' }),
    }
    // A field added to the section without a mutant here would silently stop
    // being replayable in the boot window (issue #26's lesson, other direction).
    const expected = [
      'flavor',
      ...Object.keys(baseline.glass).map((key) => `glass.${key}`),
      ...Object.keys(baseline).filter((key) => key !== 'flavor' && key !== 'glass'),
    ].sort()
    expect(Object.keys(mutants).sort()).toEqual(expected)

    for (const [field, mutate] of Object.entries(mutants)) {
      const local = mutate(baseline)
      const replayed = replayLocalChanges(stateFromSettingsSection(baseline), baseline, local)
      expect(replayed.changed, field).toBe(true)
      expect(settingsSectionsEqual(settingsSectionFromState(replayed.state), local), field).toBe(true)
    }
  })
})
