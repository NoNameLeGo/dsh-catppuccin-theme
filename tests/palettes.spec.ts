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

describe('weak label readability on dark flavours (issue #7)', () => {
  // Backgrounds the weak label aliases land on, resolved through their
  // official var() chains: menus/cards (specific-menu -> bg-layer-3 ->
  // bluish-800) and the page base (bg-base -> bluish-950).
  const MENU = '--dsw-specific-menu'
  const PAGE = '--dsw-alias-bg-base'

  /** Resolve a var(--dsw-static-neutral-bluish-N) ref (or plain hex) to hex. */
  function resolveHex(tokens: Record<string, string>, ref: string): string {
    const m = ref.match(/^var\(--dsw-static-neutral-bluish-(\d+)\)$/)
    if (m) {
      const hex = tokens[`--dsw-static-neutral-bluish-${m[1]}`]
      if (!hex) throw new Error(`missing bluish-${m[1]} referenced by ${ref}`)
      return hex
    }
    if (/^#[0-9a-fA-F]{6}$/.test(ref)) return ref
    throw new Error(`cannot resolve ${ref} — only bluish statics and hex are supported`)
  }

  /** Resolve an alias through its chain ({var -> var}* -> hex static). */
  function resolveAlias(tokens: Record<string, string>, name: string, depth = 0): string {
    const ref = tokens[name]
    if (!ref) throw new Error(`missing token ${name}`)
    if (depth > 4) throw new Error(`circular or too deep alias chain for ${name}`)
    const m = ref.match(/^var\(--([a-z-0-9]+)\)$/)
    if (m) {
      const next = resolveAlias(tokens, `--${m[1]}`, depth + 1)
      return resolveHex(tokens, next.startsWith('#') ? next : ref) // next is already hex
    }
    return resolveHex(tokens, ref)
  }

  function resolveAliasHex(tokens: Record<string, string>, name: string): string {
    return resolveAlias(tokens, name)
  }

  function channel(c: number): number {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }

  function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }

  function contrast(a: string, b: string): number {
    const la = luminance(a)
    const lb = luminance(b)
    return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05)
  }

  const darkFlavors = CATPPUCCIN_FLAVORS.filter((f) => f.colorScheme === 'dark')

  it('label aliases resolve to bluish statics (not literal colours or other families)', () => {
    for (const f of darkFlavors) {
      for (const token of [
        '--dsw-alias-label-primary-dimmed',
        '--dsw-alias-label-secondary',
        '--dsw-alias-label-tertiary',
        '--dsw-alias-label-caption',
        '--dsw-alias-label-dimmed',
      ]) {
        expect(
          f.tokens[token],
          `${f.themeId} ${token}`,
        ).toMatch(/^var\(--dsw-static-neutral-bluish-\d+\)$/)
      }
    }
  })

  it('dark label hierarchy stays monotonic on the menu surface (issue #7)', () => {
    for (const f of darkFlavors) {
      const menu = resolveAliasHex(f.tokens, MENU)
      const levels = [
        resolveAliasHex(f.tokens, '--dsw-alias-label-primary'),
        resolveAliasHex(f.tokens, '--dsw-alias-label-primary-dimmed'),
        resolveAliasHex(f.tokens, '--dsw-alias-label-secondary'),
        resolveAliasHex(f.tokens, '--dsw-alias-label-tertiary'),
        resolveAliasHex(f.tokens, '--dsw-alias-label-caption'),
        resolveAliasHex(f.tokens, '--dsw-alias-label-dimmed'),
      ]
      const ratios = levels.map((h) => contrast(h, menu))
      for (let i = 1; i < ratios.length; i++) {
        expect(
          ratios[i - 1],
          `${f.themeId} label level ${i - 1} (${ratios[i - 1]}) should stay above level ${i} (${ratios[i]})`,
        ).toBeGreaterThan(ratios[i])
      }
    }
  })

  it('weak labels keep WCAG floors on menu and page surfaces (issue #7)', () => {
    // Floors: worst flavour across the three dark flavours, minus headroom so
    // future palette tweaks stay possible — but any slide back to the dark
    // ladder steps (400/600/750 as text) fails.        menu  page
    const floors: Record<string, { menu: number; page: number }> = {
      '--dsw-alias-label-primary-dimmed': { menu: 5.0, page: 7.0 },
      '--dsw-alias-label-secondary': { menu: 4.0, page: 6.0 },
      '--dsw-alias-label-tertiary': { menu: 3.0, page: 5.0 },
      '--dsw-alias-label-caption': { menu: 2.5, page: 4.0 },
      '--dsw-alias-label-dimmed': { menu: 2.0, page: 3.0 },
    }
    for (const f of darkFlavors) {
      const menu = resolveAliasHex(f.tokens, MENU)
      const page = resolveAliasHex(f.tokens, PAGE)
      for (const [token, { menu: menuFloor, page: pageFloor }] of Object.entries(floors)) {
        const text = resolveAliasHex(f.tokens, token)
        expect(
          contrast(text, menu),
          `${f.themeId} ${token} on menu`,
        ).toBeGreaterThanOrEqual(menuFloor)
        expect(
          contrast(text, page),
          `${f.themeId} ${token} on page base`,
        ).toBeGreaterThanOrEqual(pageFloor)
      }
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
