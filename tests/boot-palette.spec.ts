// @vitest-environment node
/**
 * Pre-paint palette rows (issue #30 補充, 2026-10-27).
 *
 * The Host ships the persisted flavour's token table inside the index HTML so
 * the first frame is Catppuccin instead of the official dark the theme
 * bootstrap paints. These cases pin the two things that can go wrong silently:
 * injecting for a state that must NOT be painted (no flavour / a legacy host
 * whose config is not a volatile ref), and letting user text escape the
 * `<style>` element it is concatenated into.
 */
import { describe, expect, it } from 'vitest'
import {
  BOOT_PALETTE_ATTR,
  bootPaletteRows,
  bootPaletteScript,
  bootPaletteStyle,
  cssSafeOverrides,
} from '../src/boot-palette.ts'
import { CATPPUCCIN_FLAVORS } from '../src/client/palettes.ts'

/** A volatile config ref, the shape DSH >= 0.1.7 hands `apply`. */
const ref = (value: unknown) => ({ get: () => value })

describe('bootPaletteRows (issue #30 補充)', () => {
  it('injects nothing without a flavour — off, unknown ids and a missing config', () => {
    expect(bootPaletteRows(undefined)).toEqual([])
    expect(bootPaletteRows({})).toEqual([])
    expect(bootPaletteRows({ flavor: ref('off') })).toEqual([])
    expect(bootPaletteRows({ flavor: ref('catppuccin-nope') })).toEqual([])
    expect(bootPaletteRows({ flavor: ref(undefined) })).toEqual([])
  })

  it('injects nothing on a legacy host, where the config field is not a ref', () => {
    // Below DSH 0.1.7 the entry config is the profile patch's STATIC value, not
    // the settings document — painting it would fight the durable choice.
    expect(bootPaletteRows({ flavor: 'catppuccin-frappe' })).toEqual([])
    expect(bootPaletteRows({ flavor: ref('catppuccin-frappe'), overrides: { '--x': 'red' } }))
      .toHaveLength(2)
  })

  it('emits a head style row plus a body script row for every flavour', () => {
    for (const flavor of CATPPUCCIN_FLAVORS) {
      const rows = bootPaletteRows({ flavor: ref(flavor.themeId) })
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ kind: 'html', placement: 'head' })
      expect(rows[1]).toMatchObject({ kind: 'script', placement: 'body' })
      const html = (rows[0] as { html: string }).html
      expect(html).toContain(`<style ${BOOT_PALETTE_ATTR}>`)
      expect(html).toContain(`:root{color-scheme:${flavor.colorScheme}}`)
      expect(html).toContain('html body,html body[data-ds-dark-theme]{')
      // The whole table has to ride along: the alias tokens are `var(...)`
      // references into the static ones, so a subset would resolve to the
      // official values and paint a half-Catppuccin frame.
      for (const name of Object.keys(flavor.tokens)) expect(html).toContain(`${name}:`)
      expect((rows[1] as { text: string }).text)
        .toBe(`(()=>{document.body.toggleAttribute('data-ds-dark-theme',${flavor.colorScheme === 'dark'})})()`)
    }
  })

  it('keeps the canvas colour derivable from the table it just declared', () => {
    const flavor = CATPPUCCIN_FLAVORS[1]
    const html = bootPaletteStyle(flavor)
    // The boot splash reads `var(--dsw-alias-bg-base, var(--dsh-boot-bg, Canvas))`
    // and `--dsw-alias-bg-base` is itself a `var(--dsw-static-*)` alias, so the
    // declaration block above has to carry both links.
    expect(html).toContain('background-color:var(--dsw-alias-bg-base)')
    expect(flavor.tokens['--dsw-alias-bg-base']).toMatch(/^var\(--dsw-static-/u)
  })

  it('never lets a value close the element it is concatenated into', () => {
    for (const flavor of CATPPUCCIN_FLAVORS) {
      const html = bootPaletteStyle(flavor, { '--dsw-static-blue-500': '#89b4fa' })
      // The element's own closing tag is the only one allowed: the row contract
      // (IndexInjection) is "text must not contain `</style`".
      const inner = html.replace(/<\/style>$/u, '')
      expect(inner.toLowerCase()).not.toContain('</style')
      expect(inner.toLowerCase()).not.toContain('<script')
      expect(bootPaletteScript(flavor).toLowerCase()).not.toContain('</script')
    }
  })
})

describe('cssSafeOverrides', () => {
  it('keeps CSS expressions the user may legitimately set', () => {
    expect(cssSafeOverrides({
      '--dsw-static-blue-500': '#89b4fa',
      '--dsw-alias-bg-base': 'color-mix(in srgb, #1e1e2e 80%, #181825)',
      '--dsw-menu-surface-fill': 'rgba(30, 30, 46, 0.58)',
      '--dsw-static-green-500': 'var(--dsw-static-green-400)',
    })).toEqual({
      '--dsw-static-blue-500': '#89b4fa',
      '--dsw-alias-bg-base': 'color-mix(in srgb, #1e1e2e 80%, #181825)',
      '--dsw-menu-surface-fill': 'rgba(30, 30, 46, 0.58)',
      '--dsw-static-green-500': 'var(--dsw-static-green-400)',
    })
  })

  it('drops everything that could escape the declaration or the element', () => {
    expect(cssSafeOverrides({
      // Not a custom property.
      'color': 'red',
      // Element escape.
      '--x': '</style><script>alert(1)</script>',
      // Declaration escape.
      '--y': '#fff;color:red',
      '--z': '#fff}',
      // Backslash + control characters.
      '--w': '#fff\\',
      '--v': '#fff\n',
      // Not a string.
      '--u': 42,
    })).toEqual({})
  })

  it('appends the surviving overrides AFTER the table so they win', () => {
    const flavor = CATPPUCCIN_FLAVORS[0]
    const html = bootPaletteStyle(flavor, { '--dsw-static-blue-500': '#abcdef' })
    // `#abcdef` names no value in the table, so its position is unambiguous.
    const overrideAt = html.indexOf('--dsw-static-blue-500:#abcdef')
    expect(overrideAt).toBeGreaterThan(0)
    const lastToken = Object.keys(flavor.tokens).at(-1) ?? ''
    expect(overrideAt).toBeGreaterThan(html.indexOf(`${lastToken}:`))
  })
})
