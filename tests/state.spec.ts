// @vitest-environment jsdom
/**
 * Durable state contract — the shared shape, the sanitization/clamping rules,
 * and the sync guard that keeps `src/state.ts` aligned with the client's
 * registered flavour ids (the glass knob defaults are derived from
 * `DEFAULT_GLASS` directly, so no guard is needed). A drift here would
 * resurface the Desktop "theme does not stick across restart" bug as restored
 * but wrong values (the durable file is the source of truth on every boot).
 */
import { describe, expect, it } from 'vitest'
import {
  CATPPUCCIN_THEME_IDS,
  DEFAULT_GLASS,
  STATE_FILENAME,
  STATE_ROUTE_PATH,
  STATE_VERSION,
  defaultState,
  isDefaultState,
  sanitizeState,
} from '../src/state.ts'
import { CATPPUCCIN_FLAVORS } from '../src/client/palettes.ts'
import { CATPPUCCIN_FLAVOR_VALUES } from '../src/client/index.ts'

describe('durable state defaults', () => {
  it('defaults to no Catppuccin flavour and no glass', () => {
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
    })
  })

  it('isDefaultState only accepts a fully default state', () => {
    expect(isDefaultState(defaultState())).toBe(true)
    expect(isDefaultState(sanitizeState({ flavor: 'catppuccin-mocha' }))).toBe(false)
    expect(isDefaultState(sanitizeState({ glass: { enabled: true } }))).toBe(false)
    expect(isDefaultState(sanitizeState({ glass: { blur: 10 } }))).toBe(false)
  })

  it('routes to the Host and a stable file name under the DSH home', () => {
    expect(STATE_ROUTE_PATH).toBe('/catppuccin/state')
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

  it('is idempotent — sanitizing a sanitized state changes nothing', () => {
    const once = sanitizeState({ flavor: 'catppuccin-latte', glass: { enabled: true, blur: 9 } })
    expect(sanitizeState(once)).toEqual(once)
  })
})

describe('durable vs client sync guards', () => {
  it('the persisted flavour values equal the registered theme ids plus off', () => {
    expect(CATPPUCCIN_THEME_IDS).toEqual(CATPPUCCIN_FLAVORS.map((f) => f.themeId))
    expect(CATPPUCCIN_THEME_IDS).toEqual(CATPPUCCIN_FLAVOR_VALUES.filter((v) => v !== 'off'))
  })

})
