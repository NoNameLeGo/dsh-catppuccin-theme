// @vitest-environment jsdom
/**
 * Catppuccin plugin spec — the token tables and flavour metadata contract.
 * Palettes are pure data: every official --dsw-* token must be present in
 * every flavour, alias entries keep their var() refs, the brand pin resolves
 * to the Catppuccin blue, and dark flavours put the deepest surface on the
 * bg-base alias end (bluish-950).
 */
import { describe, expect, it } from 'vitest'
import { CATPPUCCIN_FLAVORS } from '../src/client/palettes.ts'
import {
  CATPPUCCIN_FLAVOR_VALUES,
  FLAVOR_STORAGE_KEY,
  flavorFromThemeId,
  flavorInfo,
  readFlavor,
  writeFlavor,
} from '../src/client/index.ts'

describe('Catppuccin palettes', () => {
  it('covers all four flavours', () => {
    expect(CATPPUCCIN_FLAVORS.map((f) => f.themeId)).toEqual([
      'catppuccin-latte',
      'catppuccin-frappe',
      'catppuccin-macchiato',
      'catppuccin-mocha',
    ])
  })

  it('latte is light, the rest dark', () => {
    expect(CATPPUCCIN_FLAVORS[0].colorScheme).toBe('light')
    for (const f of CATPPUCCIN_FLAVORS.slice(1)) expect(f.colorScheme).toBe('dark')
  })

  it('every flavour carries the full token ladder with -- prefixes', () => {
    const expected = [
      '--dsw-static-neutral-bluish-00',
      '--dsw-static-neutral-bluish-1000',
      '--dsw-static-deepseek-500',
      '--dsw-static-red-500',
      '--dsw-static-green-500',
      '--dsw-alias-bg-base',
      '--dsw-alias-label-primary',
      '--dsw-specific-bubble',
    ]
    for (const f of CATPPUCCIN_FLAVORS) {
      for (const token of expected) expect(f.tokens[token], `${f.themeId} ${token}`).toBeTruthy()
      const keys = Object.keys(f.tokens)
      for (const key of keys) expect(key.startsWith('--dsw-')).toBe(true)
    }
  })

  it('dark flavours map bg-base to the deepest surface (crust)', () => {
    const mocha = CATPPUCCIN_FLAVORS.find((f) => f.themeId === 'catppuccin-mocha')!
    // alias keeps the official var() ref; the static end it names is crust.
    expect(mocha.tokens['--dsw-alias-bg-base']).toBe('var(--dsw-static-neutral-bluish-950)')
    expect(mocha.tokens['--dsw-static-neutral-bluish-950']).toBe('#11111b')
  })

  it('brand pin resolves to the Catppuccin blue', () => {
    const latte = CATPPUCCIN_FLAVORS.find((f) => f.themeId === 'catppuccin-latte')!
    expect(latte.tokens['--dsw-alias-brand-primary-new-colorprimary-new-color']).toBe('#1e66f5')
  })
})

describe('flavour helpers', () => {
  it('maps theme ids and off', () => {
    expect(flavorFromThemeId('catppuccin-mocha')).toBe('catppuccin-mocha')
    expect(flavorFromThemeId('dark')).toBe('off')
    expect(flavorFromThemeId('catppuccin-unknown')).toBe('off')
  })

  it('finds flavour info by theme id', () => {
    expect(flavorInfo('catppuccin-latte')?.label).toBe('Latte')
    expect(flavorInfo('light')).toBeUndefined()
  })
})

describe('persisted flavour contract', () => {
  it('flavour values equal the registered theme ids plus off', () => {
    // The browser half persists the theme id itself; the accepted value set
    // must stay exactly the four registered ids plus `off`.
    expect(CATPPUCCIN_FLAVOR_VALUES).toEqual([
      ...CATPPUCCIN_FLAVORS.map((f) => f.themeId),
      'off',
    ])
  })

  it('readFlavor falls back to off for absent or unknown values', () => {
    localStorage.removeItem(FLAVOR_STORAGE_KEY)
    expect(readFlavor()).toBe('off')
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    expect(readFlavor()).toBe('catppuccin-mocha')
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'mocha')
    expect(readFlavor()).toBe('off')
    localStorage.removeItem(FLAVOR_STORAGE_KEY)
  })

  it('writeFlavor persists the choice', () => {
    writeFlavor('catppuccin-latte')
    expect(localStorage.getItem(FLAVOR_STORAGE_KEY)).toBe('catppuccin-latte')
    writeFlavor('off')
    expect(localStorage.getItem(FLAVOR_STORAGE_KEY)).toBe('off')
    localStorage.removeItem(FLAVOR_STORAGE_KEY)
  })
})
