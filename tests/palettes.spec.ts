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
import { SHIKI_TOKENS } from '../src/client/shiki-tokens.ts'

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

  describe('dark flavour text contrast (issue #7)', () => {
    /** Follow var(--x) chains inside one flavour's token dictionary. */
    const resolve = (tokens: Record<string, string>, name: string): string => {
      let value = tokens[name]
      for (let depth = 0; typeof value === 'string' && value.startsWith('var(') && depth < 10; depth++) {
        value = tokens[value.slice(4, -1)]
      }
      return value
    }
    const luminance = (hex: string): number => {
      const channel = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
      return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2]
    }
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    /** The five-level text hierarchy, brightest first. */
    const TEXT_LEVELS = [
      '--dsw-alias-label-primary',
      '--dsw-alias-label-primary-dimmed',
      '--dsw-alias-label-secondary',
      '--dsw-alias-label-tertiary',
      '--dsw-alias-label-caption',
    ] as const
    /** Worst-case floors on the menu surface (the darkest text surface pairing). */
    const MENU_FLOORS: Record<(typeof TEXT_LEVELS)[number], number> = {
      '--dsw-alias-label-primary': 6.0,
      '--dsw-alias-label-primary-dimmed': 5.0,
      '--dsw-alias-label-secondary': 4.0,
      '--dsw-alias-label-tertiary': 3.4,
      '--dsw-alias-label-caption': 2.75,
    }

    it('text levels keep their order and stay readable on dark surfaces', () => {
      for (const f of CATPPUCCIN_FLAVORS) {
        if (f.colorScheme !== 'dark') continue
        const menu = resolve(f.tokens, '--dsw-specific-menu')
        const base = resolve(f.tokens, '--dsw-alias-bg-base')
        const ratios = TEXT_LEVELS.map((level) => contrast(resolve(f.tokens, level), menu))
        for (let i = 1; i < ratios.length; i++) {
          expect(ratios[i], `${f.themeId} ${TEXT_LEVELS[i]} dimmer than ${TEXT_LEVELS[i - 1]}`).toBeLessThan(ratios[i - 1])
        }
        for (const level of TEXT_LEVELS) {
          const colour = resolve(f.tokens, level)
          expect(contrast(colour, menu), `${f.themeId} ${level} on menu`).toBeGreaterThanOrEqual(MENU_FLOORS[level])
          expect(contrast(colour, base), `${f.themeId} ${level} on base`).toBeGreaterThanOrEqual(MENU_FLOORS[level])
        }
      }
    })
  })

  it('brand pin resolves to the Catppuccin blue', () => {
    const latte = CATPPUCCIN_FLAVORS.find((f) => f.themeId === 'catppuccin-latte')!
    expect(latte.tokens['--dsw-alias-brand-primary-new-colorprimary-new-color']).toBe('#1e66f5')
  })

  it('amber-400 uses peach (not yellow) across all flavours', () => {
    // amber-400 is the secondary warning accent; it must stay in the peach
    // family for consistency with the Catppuccin palette where yellow is
    // semantically distinct (strings / types / classes).
    for (const f of CATPPUCCIN_FLAVORS) {
      const value = f.tokens['--dsw-static-amber-400']
      expect(value, `${f.themeId} amber-400`).toMatch(/color-mix/)
      // The base colour inside the mix must be the flavour's peach, not yellow.
      expect(value, `${f.themeId} amber-400`).not.toContain('yellow')
    }
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

describe('shiki syntax highlighting tokens', () => {
  const REQUIRED_TOKENS = [
    '--shiki-foreground',
    '--shiki-background',
    '--shiki-token-constant',
    '--shiki-token-string',
    '--shiki-token-comment',
    '--shiki-token-keyword',
    '--shiki-token-parameter',
    '--shiki-token-function',
    '--shiki-token-string-expression',
    '--shiki-token-punctuation',
    '--shiki-token-link',
  ] as const

  it('covers all four flavours', () => {
    expect(Object.keys(SHIKI_TOKENS).sort()).toEqual([
      'frappe',
      'latte',
      'macchiato',
      'mocha',
    ])
  })

  it('every flavour has all required shiki tokens', () => {
    for (const [flavorId, tokens] of Object.entries(SHIKI_TOKENS)) {
      for (const token of REQUIRED_TOKENS) {
        expect(tokens[token], `${flavorId} ${token}`).toBeTruthy()
      }
    }
  })

  it('foreground and background use var() references', () => {
    for (const [, tokens] of Object.entries(SHIKI_TOKENS)) {
      expect(tokens['--shiki-foreground']).toBe('var(--dsw-alias-label-primary)')
      expect(tokens['--shiki-background']).toBe('var(--dsw-alias-markdown-code-block)')
    }
  })

  it('all token colours are valid hex or var()', () => {
    const hexRe = /^#[0-9a-fA-F]{6}$/
    const varRe = /^var\(--[a-zA-Z-]+\)$/
    for (const [, tokens] of Object.entries(SHIKI_TOKENS)) {
      for (const token of REQUIRED_TOKENS) {
        const value = tokens[token]
        expect(
          hexRe.test(value) || varRe.test(value),
          `${token} = ${value} is not a valid hex colour or var() ref`,
        ).toBe(true)
      }
    }
  })

  it('Mocha constants match the Catppuccin palette', () => {
    const m = SHIKI_TOKENS.mocha
    expect(m['--shiki-token-constant']).toBe('#fab387') // peach
    expect(m['--shiki-token-string']).toBe('#a6e3a1')   // green
    expect(m['--shiki-token-comment']).toBe('#9399b2')   // overlay2
    expect(m['--shiki-token-keyword']).toBe('#cba6f7')   // mauve
    expect(m['--shiki-token-parameter']).toBe('#eba0ac')  // maroon
    expect(m['--shiki-token-function']).toBe('#89b4fa')   // blue
    expect(m['--shiki-token-punctuation']).toBe('#9399b2') // overlay2
    expect(m['--shiki-token-link']).toBe('#89b4fa')       // blue
  })

  it('Latte constants match the Catppuccin palette', () => {
    const l = SHIKI_TOKENS.latte
    expect(l['--shiki-token-constant']).toBe('#fe640b') // peach
    expect(l['--shiki-token-string']).toBe('#40a02b')   // green
    expect(l['--shiki-token-comment']).toBe('#7c7f93')   // overlay2
    expect(l['--shiki-token-keyword']).toBe('#8839ef')   // mauve
    expect(l['--shiki-token-parameter']).toBe('#e64553')  // maroon
    expect(l['--shiki-token-function']).toBe('#1e66f5')   // blue
    expect(l['--shiki-token-punctuation']).toBe('#7c7f93') // overlay2
    expect(l['--shiki-token-link']).toBe('#1e66f5')       // blue
  })

  it('each dark flavour has distinct palette-derived colours', () => {
    // Frappé, Macchiato, and Mocha should all have different hex values
    // because their palettes differ.
    const f = SHIKI_TOKENS.frappe
    const ma = SHIKI_TOKENS.macchiato
    const mo = SHIKI_TOKENS.mocha
    // At least the peach (constant) should differ across flavours.
    const peaches = new Set([f['--shiki-token-constant'], ma['--shiki-token-constant'], mo['--shiki-token-constant']])
    expect(peaches.size).toBe(3)
  })

  it('string and string-expression are identical within each flavour', () => {
    for (const [, tokens] of Object.entries(SHIKI_TOKENS)) {
      expect(tokens['--shiki-token-string-expression']).toBe(tokens['--shiki-token-string'])
    }
  })
})
