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
  isDefaultState,
  migrate,
  sanitizeState,
  settingsSectionFromState,
  settingsSectionsEqual,
  stateFromSettingsSection,
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
        blur: 2,
        frost: 20,
        brightness: 50,
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
