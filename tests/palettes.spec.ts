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

/** Relative-luminance channel (WCAG 2.x). */
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

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05)
}

/** One flat `color-mix(in srgb, #hex p%, #hex)` — the shape the generator emits. */
const MIX = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, (#[0-9a-f]{6})\)$/

function mixHex(a: string, pct: number, b: string): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [ca, cb] = [channels(a), channels(b)]
  return `#${ca.map((c, i) => Math.round(c * pct + cb[i] * (1 - pct)).toString(16).padStart(2, '0')).join('')}`
}

/** Resolve a token through var() chains and flat color-mix steps to a hex colour. */
function resolveColor(tokens: Record<string, string>, name: string, depth = 0): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`missing token ${name}`)
  if (depth > 4) throw new Error(`circular or too deep alias chain for ${name}`)
  const ref = value.match(/^var\((--[a-z0-9-]+)\)$/)
  if (ref) return resolveColor(tokens, ref[1], depth + 1)
  const mixed = value.match(MIX)
  if (mixed) return mixHex(mixed[1], Number(mixed[2]) / 100, mixed[3])
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  throw new Error(`cannot resolve ${name} = ${value}`)
}

const DARK_FLAVORS = CATPPUCCIN_FLAVORS.filter((f) => f.colorScheme === 'dark')

/** Surfaces the weak-label and link assertions measure against. */
const MENU = '--dsw-specific-menu'
const PAGE = '--dsw-alias-bg-base'

/** Resolve a var(--…) chain (any family) or a plain hex to a hex colour. */
function resolveHex(tokens: Record<string, string>, ref: string, depth = 0): string {
  if (depth > 4) throw new Error(`circular or too deep alias chain for ${ref}`)
  const m = ref.match(/^var\(--([a-z0-9-]+)\)$/)
  if (m !== null) {
    const next = tokens[`--${m[1]}`]
    if (next === undefined) throw new Error(`missing token --${m[1]} referenced by ${ref}`)
    return resolveHex(tokens, next, depth + 1)
  }
  if (/^#[0-9a-fA-F]{6}$/.test(ref)) return ref
  throw new Error(`cannot resolve ${ref} — expected a var() chain ending in a hex`)
}

/** Resolve an alias through its chain ({var -> var}* -> hex static). */
function resolveAliasHex(tokens: Record<string, string>, name: string): string {
  const ref = tokens[name]
  if (ref === undefined) throw new Error(`missing token ${name}`)
  return resolveHex(tokens, ref)
}

/** Composite `fg` at `alpha` over an opaque `bg` (src-over, sRGB). */
function over(fg: string, alpha: number, bg: string): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [f, b] = [channels(fg), channels(bg)]
  return `#${f
    .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`
}

/** The `color-mix(in srgb, <fill> N%, transparent)` shape (translucent surfaces). */
const ALPHA_MIX = /^color-mix\(in srgb, (var\(--[a-z0-9-]+\)|#[0-9a-fA-F]{6}) (\d+)%, transparent\)$/

/**
 * Resolve a *surface* token to the colour a user actually sees. Menus became
 * translucent upstream in 0.1.7 — `--dsw-specific-menu` is now
 * `color-mix(in srgb, var(--dsw-alias-bg-layer-3) P%, transparent)` (see
 * `specificOverrides` in generate-palettes.mjs) and rides the host's own
 * `--dsw-menu-backdrop-filter`, so its effective colour is the fill
 * composited over the page. Opaque surfaces resolve as before.
 */
function resolveSurface(tokens: Record<string, string>, name: string): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`missing token ${name}`)
  const alphaMix = value.match(ALPHA_MIX)
  if (alphaMix === null) return resolveAliasHex(tokens, name)
  const fill = resolveHex(tokens, alphaMix[1])
  return over(fill, Number(alphaMix[2]) / 100, resolveAliasHex(tokens, PAGE))
}

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

describe('weak label readability (issues #7, #12)', () => {
  it('label aliases resolve to bluish statics (not literal colours or other families)', () => {
    for (const f of DARK_FLAVORS) {
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
    for (const f of DARK_FLAVORS) {
      const menu = resolveSurface(f.tokens, MENU)
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

  it('latte keeps the official light ladder — order intact, nothing slides lighter', () => {
    // Issue #12. The light flavour deliberately keeps the OFFICIAL alias→step
    // mapping (unlike the dark flavours, which need the issue #7 overrides),
    // because upstream's light theme itself paints weak labels with light
    // greys: official label-caption is rgb(173,178,184) = 2.14:1 on its own
    // white input, while Latte's bluish-400 #7c7f93 lands at 3.49:1 on
    // #eff1f5 — i.e. the faithful mapping is already 1.6× STRONGER than the
    // theme it adapts. So there is no "official value does not hold under DSH"
    // evidence here, and per rule 1 nothing is deviated.
    //
    // Dragging caption up to AA (4.5) is a product decision, not a
    // faithfulness fix: bluish-500 #6c6f85 only reaches 4.37:1, so AA needs
    // bluish-600 #5c5f77 (5.53:1) — exactly secondary/tertiary's own value,
    // collapsing two ladder levels. Both options were measured and rejected on
    // 2026-09-16; what is locked here is (a) the official step per alias and
    // (b) the resulting ratio floors (measured minus headroom), so no future
    // tweak can slide a weak label lighter or flatten the ladder silently.
    const latte = CATPPUCCIN_FLAVORS.find((f) => f.colorScheme === 'light')!
    const officialSteps: Record<string, string> = {
      '--dsw-alias-label-primary-dimmed': 'var(--dsw-static-neutral-bluish-950)',
      '--dsw-alias-label-secondary': 'var(--dsw-static-neutral-bluish-700)',
      '--dsw-alias-label-tertiary': 'var(--dsw-static-neutral-bluish-600)',
      '--dsw-alias-label-caption': 'var(--dsw-static-neutral-bluish-400)',
      '--dsw-alias-label-dimmed': 'var(--dsw-static-neutral-bluish-200)',
    }
    for (const [token, step] of Object.entries(officialSteps)) {
      expect(latte.tokens[token], `latte ${token}`).toBe(step)
    }

    // Measured 2026-09-16 (menu == page here: Latte maps both to bluish-00):
    // primary 7.06 | primary-dimmed 7.06 | secondary 5.53 | tertiary 5.53 |
    // caption 3.49 | dimmed 2.30.
    const floors: Record<string, { menu: number; page: number }> = {
      '--dsw-alias-label-primary-dimmed': { menu: 6.5, page: 6.5 },
      '--dsw-alias-label-secondary': { menu: 5.0, page: 5.0 },
      '--dsw-alias-label-tertiary': { menu: 5.0, page: 5.0 },
      '--dsw-alias-label-caption': { menu: 3.2, page: 3.2 },
      '--dsw-alias-label-dimmed': { menu: 2.1, page: 2.1 },
    }
    const menu = resolveSurface(latte.tokens, MENU)
    const page = resolveAliasHex(latte.tokens, PAGE)
    const ladder = [
      '--dsw-alias-label-primary',
      '--dsw-alias-label-primary-dimmed',
      '--dsw-alias-label-secondary',
      '--dsw-alias-label-tertiary',
      '--dsw-alias-label-caption',
      '--dsw-alias-label-dimmed',
    ]
    const ratios = ladder.map((token) => contrast(resolveAliasHex(latte.tokens, token), page))
    for (let i = 1; i < ratios.length; i++) {
      expect(
        ratios[i - 1],
        `latte label level ${i - 1} (${ratios[i - 1].toFixed(2)}) must not sink below level ${i} (${ratios[i].toFixed(2)})`,
      ).toBeGreaterThanOrEqual(ratios[i])
    }
    for (const [token, { menu: menuFloor, page: pageFloor }] of Object.entries(floors)) {
      const text = resolveAliasHex(latte.tokens, token)
      expect(contrast(text, menu), `latte ${token} on menu`).toBeGreaterThanOrEqual(menuFloor)
      expect(contrast(text, page), `latte ${token} on page base`).toBeGreaterThanOrEqual(pageFloor)
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
    for (const f of DARK_FLAVORS) {
      const menu = resolveSurface(f.tokens, MENU)
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

describe('dark blue tint readability (issue #11)', () => {
  // The dark flavour blue ladder feeds two very different consumers: solid
  // fills at the bright end (button-info-fill, the switch track) and *tinted
  // surfaces* at the dark end. state-business-tertiary paints the dark end
  // under a blue label — the selected segment of a segmented pick
  // (CatppuccinRow / GlassRow / UpdateRow) and the host's trajectory "user"
  // badge — so the pair has to clear AA on its own.
  const TINT = '--dsw-alias-state-business-tertiary'
  const LABEL = '--dsw-alias-state-business-primary'

  it('paints the tint near the deepest surface, not mid-tone', () => {
    for (const f of DARK_FLAVORS) {
      expect(f.tokens[TINT], `${f.themeId} ${TINT}`).toBe('var(--dsw-static-deepseek-800)')
      expect(f.tokens['--dsw-static-deepseek-800'], `${f.themeId} deepseek-800`).toMatch(
        /^color-mix\(in srgb, #\w{6} (1[0-9]|[1-9])%, #\w{6}\)$/,
      )
    }
  })

  it('keeps the blue label on the blue tint at AA and the track above 3:1', () => {
    for (const f of DARK_FLAVORS) {
      const label = resolveColor(f.tokens, LABEL)
      expect(
        contrast(label, resolveColor(f.tokens, TINT)),
        `${f.themeId} ${LABEL} on ${TINT}`,
      ).toBeGreaterThanOrEqual(4.5)
      // The same token doubles as a fill (switch track, focus ring, active tab),
      // where 3:1 is the non-text UI floor.
      expect(
        contrast(label, resolveColor(f.tokens, PAGE)),
        `${f.themeId} ${LABEL} vs page base`,
      ).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('dark status tint readability (VV)', () => {
  // state-success-tertiary / state-warn-tertiary paint a *tinted surface* that a
  // bright label sits on — the official contextGreen / warn-label chips. The
  // generic `base` mix left the dark flavours at 3.18–4.37:1 (the same failure
  // the blue tint had in issue #11, differing only in colour family), so the
  // 900 step now mixes 14% toward `crust` instead.
  const PAIRS = [
    ['--dsw-alias-state-success-primary', '--dsw-alias-state-success-tertiary'],
    ['--dsw-alias-state-warn-label', '--dsw-alias-state-warn-tertiary'],
  ]

  it('paints both status tints near the deepest surface in dark flavours', () => {
    for (const f of DARK_FLAVORS) {
      expect(f.tokens['--dsw-alias-state-success-tertiary'], `${f.themeId} success tint`).toBe(
        'var(--dsw-static-green-900)',
      )
      expect(f.tokens['--dsw-alias-state-warn-tertiary'], `${f.themeId} warn tint`).toBe(
        'var(--dsw-static-amber-900)',
      )
      const crust = f.tokens['--dsw-static-neutral-bluish-950']
      for (const key of ['--dsw-static-green-900', '--dsw-static-amber-900']) {
        // Low percentage + the deepest surface — mid-tone is what broke AA.
        expect(f.tokens[key], `${f.themeId} ${key}`).toMatch(
          /^color-mix\(in srgb, #[0-9a-f]{6} (1[0-9]|[1-9])%, #[0-9a-f]{6}\)$/,
        )
        expect(
          f.tokens[key].endsWith(`, ${crust})`),
          `${f.themeId} ${key} must mix toward crust (${crust})`,
        ).toBe(true)
      }
    }
  })

  it('keeps each status label on its own tint at AA', () => {
    for (const f of DARK_FLAVORS) {
      for (const [label, tint] of PAIRS) {
        expect(
          contrast(resolveColor(f.tokens, label), resolveColor(f.tokens, tint)),
          `${f.themeId} ${label} on ${tint}`,
        ).toBeGreaterThanOrEqual(4.5)
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
  const STYLES = ['default', 'italic-comments'] as const

  it('covers all four flavours', () => {
    expect(Object.keys(SHIKI_TOKENS).sort()).toEqual([
      'frappe',
      'latte',
      'macchiato',
      'mocha',
    ])
  })

  it('every flavour carries both styles (item M)', () => {
    for (const flavorId of Object.keys(SHIKI_TOKENS)) {
      expect(Object.keys(SHIKI_TOKENS[flavorId as keyof typeof SHIKI_TOKENS]).sort()).toEqual([...STYLES])
    }
  })

  it('every flavour × style has all required shiki tokens', () => {
    for (const [flavorId, styles] of Object.entries(SHIKI_TOKENS)) {
      for (const style of STYLES) {
        for (const token of REQUIRED_TOKENS) {
          expect(styles[style][token], `${flavorId} ${style} ${token}`).toBeTruthy()
        }
      }
    }
  })

  it('foreground and background use var() references', () => {
    for (const styles of Object.values(SHIKI_TOKENS)) {
      for (const tokens of Object.values(styles)) {
        expect(tokens['--shiki-foreground']).toBe('var(--dsw-alias-label-primary)')
        expect(tokens['--shiki-background']).toBe('var(--dsw-alias-markdown-code-block)')
      }
    }
  })

  it('all token colours are valid hex or var()', () => {
    const hexRe = /^#[0-9a-fA-F]{6}$/
    const varRe = /^var\(--[a-zA-Z-]+\)$/
    for (const styles of Object.values(SHIKI_TOKENS)) {
      for (const tokens of Object.values(styles)) {
        for (const token of REQUIRED_TOKENS) {
          const value = tokens[token]
          expect(
            hexRe.test(value) || varRe.test(value),
            `${token} = ${value} is not a valid hex colour or var() ref`,
          ).toBe(true)
        }
      }
    }
  })

  it('Mocha constants match the Catppuccin palette', () => {
    const m = SHIKI_TOKENS.mocha.default
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
    const l = SHIKI_TOKENS.latte.default
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
    const f = SHIKI_TOKENS.frappe.default
    const ma = SHIKI_TOKENS.macchiato.default
    const mo = SHIKI_TOKENS.mocha.default
    // At least the peach (constant) should differ across flavours.
    const peaches = new Set([f['--shiki-token-constant'], ma['--shiki-token-constant'], mo['--shiki-token-constant']])
    expect(peaches.size).toBe(3)
  })

  it('string and string-expression are identical within each flavour', () => {
    for (const styles of Object.values(SHIKI_TOKENS)) {
      for (const tokens of Object.values(styles)) {
        expect(tokens['--shiki-token-string-expression']).toBe(tokens['--shiki-token-string'])
      }
    }
  })

  it('the italic-comments variant softens the comment colour to subtext0 (item M)', () => {
    for (const [flavorId, styles] of Object.entries(SHIKI_TOKENS)) {
      const comments = new Set([styles.default['--shiki-token-comment'], styles['italic-comments']['--shiki-token-comment']])
      expect(comments.size, `${flavorId} variant must differ from the default`).toBe(2)
    }
  })
})

describe('upstream 0.1.7 token additions (compat audit 2026-09-23)', () => {
  // The 0.1.7 refresh added nine tokens (static 73 -> 77, alias 79 -> 84). They
  // are the reason the cached token snapshot had to be rebuilt: without them the
  // new surfaces fall back to the stock palette — or, for the alpha-suffixed
  // statics, to an opaque block where upstream wants an 8/12% wash. See
  // generate-palettes.mjs (splitAlpha / withAlpha / specificOverrides and the
  // link + document-preview readability entries).
  const ADDED = [
    '--dsw-static-green-500-a08',
    '--dsw-static-green-500-a12',
    '--dsw-static-red-400-a12',
    '--dsw-static-red-600-a08',
    '--dsw-alias-bg-document-preview',
    '--dsw-alias-label-document-preview',
    '--dsw-alias-link',
    '--dsw-alias-code-diff-added',
    '--dsw-alias-code-diff-deleted',
    '--dsw-alias-state-idle-primary',
  ]
  const LATTE = CATPPUCCIN_FLAVORS.find((f) => f.colorScheme === 'light')!

  it('every flavour covers every added token', () => {
    for (const f of CATPPUCCIN_FLAVORS) {
      for (const token of ADDED) expect(f.tokens[token], `${f.themeId} ${token}`).toBeTruthy()
    }
  })

  it('alpha statics keep upstream alpha instead of collapsing to a solid block', () => {
    // `-a08` / `-a12` mean "this step at N% alpha", not a ladder step. Before
    // the fix the step fell through to the family default, so every diff tint
    // painted fully opaque.
    const alphaByToken: Record<string, number> = {
      '--dsw-static-green-500-a08': 8,
      '--dsw-static-green-500-a12': 12,
      '--dsw-static-red-400-a12': 12,
      '--dsw-static-red-600-a08': 8,
    }
    for (const f of CATPPUCCIN_FLAVORS) {
      for (const [token, pct] of Object.entries(alphaByToken)) {
        const m = f.tokens[token].match(ALPHA_MIX)
        expect(m, `${f.themeId} ${token} = ${f.tokens[token]}`).not.toBeNull()
        expect(Number(m![2]), `${f.themeId} ${token} alpha`).toBe(pct)
        // The fill resolves to a Catppuccin colour through the family plan.
        expect(resolveHex(f.tokens, m![1]), `${f.themeId} ${token} fill`).toMatch(/^#[0-9a-f]{6}$/)
      }
      // The diff surfaces consume the alpha statics (light/dark differ upstream).
      expect(f.tokens['--dsw-alias-code-diff-added']).toBe(
        f.colorScheme === 'dark'
          ? 'var(--dsw-static-green-500-a12)'
          : 'var(--dsw-static-green-500-a08)',
      )
      expect(f.tokens['--dsw-alias-code-diff-deleted']).toBe(
        f.colorScheme === 'dark'
          ? 'var(--dsw-static-red-400-a12)'
          : 'var(--dsw-static-red-600-a08)',
      )
    }
  })

  it('menu keeps the Catppuccin hue at upstream translucency', () => {
    // Upstream 0.1.7 hard-codes rgba(248,249,250,.58) / rgba(48,49,54,.5) here
    // so menus can ride --dsw-menu-backdrop-filter. Keeping the literal would
    // drop the flavour from every menu and popover (10+ consumers).
    for (const f of CATPPUCCIN_FLAVORS) {
      const m = f.tokens[MENU].match(ALPHA_MIX)
      expect(m, `${f.themeId} ${MENU} = ${f.tokens[MENU]}`).not.toBeNull()
      expect(m![1], `${f.themeId} ${MENU} fill`).toBe('var(--dsw-alias-bg-layer-3)')
      expect(Number(m![2]), `${f.themeId} ${MENU} alpha`).toBe(f.colorScheme === 'dark' ? 50 : 58)
    }
  })

  it('the opaque pre-0.1.7 fallback resolves to the flavour surface, not a grey', () => {
    // `menuSurfaceFor(false)` (src/client/index.ts) injects exactly this on
    // hosts without the menu blur — the pre-0.1.7 alias value, which has to land
    // on the flavour's own surface rather than upstream's grey.
    const FALLBACK = 'var(--dsw-alias-bg-layer-3)'
    const expected: Record<string, string> = {
      'catppuccin-latte': '#eff1f5', // light layer-3 -> bluish-00 -> base
      'catppuccin-frappe': '#414559', // dark layer-3 -> bluish-800 -> surface0
      'catppuccin-macchiato': '#363a4f',
      'catppuccin-mocha': '#313244',
    }
    for (const f of CATPPUCCIN_FLAVORS) {
      expect(resolveHex(f.tokens, FALLBACK), `${f.themeId} layer-3`).toBe(expected[f.themeId])
    }
  })

  it('link text clears AA on the page in every flavour', () => {
    // Measured 2026-09-23: ours 4.34 (Latte — upstream's own pair measures
    // 4.23, so the faithful step is the better of the two) / 6.51 (Frappé) /
    // 7.77 (Macchiato) / 8.91 (Mocha, upstream 7.83).
    for (const f of CATPPUCCIN_FLAVORS) {
      const link = resolveHex(f.tokens, f.tokens['--dsw-alias-link'])
      expect(
        contrast(link, resolveAliasHex(f.tokens, PAGE)),
        `${f.themeId} ${f.tokens['--dsw-alias-link']}`,
      ).toBeGreaterThanOrEqual(f.colorScheme === 'light' ? 4.2 : 4.5)
      // Dark flavours ride the full accent step (our 66% 400 step would land at
      // 3.94–4.79:1); Latte keeps the official 500 and is left alone.
      expect(f.tokens['--dsw-alias-link']).toBe('var(--dsw-static-deepseek-500)')
    }
  })

  it('document-preview label reads on its own preview surface', () => {
    // Preview surfaces are dark in BOTH schemes (light maps bluish-750 to the
    // text colour), so the label has to clear AA against them, not the page.
    // Measured 2026-09-23: Latte 7.06:1 (upstream's own pair 9.27), dark
    // 4.45 / 4.90 / 5.07:1.
    for (const f of CATPPUCCIN_FLAVORS) {
      const bg = resolveAliasHex(f.tokens, '--dsw-alias-bg-document-preview')
      const label = resolveAliasHex(f.tokens, '--dsw-alias-label-document-preview')
      expect(contrast(label, bg), `${f.themeId} preview label`).toBeGreaterThanOrEqual(
        f.colorScheme === 'light' ? 6.5 : 4.4,
      )
    }
    // Latte deviates from the official bluish-200 step on purpose: it reads the
    // ladder light-end-first, which landed the label on overlay0 (3.07:1).
    expect(LATTE.tokens['--dsw-alias-label-document-preview']).toBe(
      'var(--dsw-static-neutral-bluish-00)',
    )
  })
})
