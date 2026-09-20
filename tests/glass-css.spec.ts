// @vitest-environment node
/**
 * Glass blur budget guard (issue #13).
 *
 * `backdrop-filter` is not free: any value other than `none` promotes the
 * element to a compositing layer whose backdrop is re-read every frame — the
 * blur radius is irrelevant, and `blur(0px)` costs the same as `blur(20px)`.
 * That only pays for itself where the surface actually covers CHANGING content.
 *
 * This skin paints a SOLID page ground (`glass.module.css`, the body rule), so
 * every surface that floats over nothing but that ground blurs an identity —
 * measured on the live GUI, the frosted fill is pixel-identical with the blur
 * removed (0 of 19184 pixels once the surface's own content is hidden); the
 * only pixels that move are the glyphs drawn above it, which get re-antialiased
 * because the surface becomes a composited layer (≤16/255 on the sidebar sheet,
 * ≤64/255 on a chat bubble). Issue #13 measured the bill for that: ~80% GPU on
 * the 3D engine during streaming with mica, <30% with compat, and no
 * sensitivity to the blur slider.
 *
 * The guard below locks the two halves of the answer:
 *  - surfaces over the flat ground (sidebar sheet, chat bubbles, trajectory
 *    panel) must NOT carry a backdrop-filter — blurring them is pure waste;
 *  - the surfaces that do cover moving content (top bar over the transcript,
 *    composer, floating menus, edge fades) must keep it — deleting those would
 *    be a silent downgrade of the skin instead of a performance fix.
 *
 * If this test fails after adding a blur, ask first whether the element has
 * anything but the page ground behind it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(new URL('../src/client/glass/glass.module.css', import.meta.url), 'utf8')

/** Selectors known to sit over the flat page ground (issue #13). */
const GROUND_ONLY = /sidebarCol|bubble|trajectory/

/** Selectors whose backdrop is genuinely moving/heterogeneous content. */
const VISIBLE = ['header', '[data-composer-card]', "[role='menu']", '[data-dsh-glass-fade]']

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Every `selector { decls }` pair, comments stripped (nested at-rules come out
 *  as their inner rules, which is all this guard needs). */
const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  (match) => ({ selector: normalize(match[1] ?? ''), decls: match[2] ?? '' }),
)

/** The `backdrop-filter` value of a rule, if any. */
const blurOf = (decls: string): string | undefined =>
  /(?:^|;)\s*backdrop-filter\s*:\s*([^;]+)/.exec(decls)?.[1]?.trim()

const blurring = rules.filter((rule) => {
  const value = blurOf(rule.decls)
  return value !== undefined && value !== 'none'
})

describe('glass blur budget (issue #13)', () => {
  it('parses the stylesheet', () => {
    expect(rules.length).toBeGreaterThan(50)
    expect(blurring.length).toBeGreaterThan(5)
  })

  it('never blurs a surface that only has the flat page ground behind it', () => {
    const wasted = blurring.filter((rule) => GROUND_ONLY.test(rule.selector))
    expect(
      wasted.map((rule) => rule.selector),
      'issue #13: this surface floats over the solid page ground — the blur is invisible and costs a per-frame backdrop read',
    ).toEqual([])
  })

  it('keeps the blur on the surfaces that do cover moving content', () => {
    for (const needle of VISIBLE) {
      const hit = blurring.find((rule) => rule.selector.includes(needle))
      expect(hit?.selector, `${needle} lost its backdrop-filter`).toBeDefined()
    }
  })

  it('keeps the composer slab erasing the inner card blur (no double read)', () => {
    const erasers = rules.filter((rule) => blurOf(rule.decls) === 'none')
    expect(erasers.length).toBeGreaterThanOrEqual(3)
    expect(erasers.some((rule) => rule.selector.includes('[data-composer-card]'))).toBe(true)
  })

  it('gives compat surfaces a material, not just a blur over the flat ground (OO)', () => {
    // Compat's blur alone painted nothing (a blurred flat ground is a no-op), so
    // the surface still read as stock DSH. The material has to be the fill + rim.
    const fill = rules.find(
      (rule) =>
        rule.selector.includes('[data-dsh-glass-compat]') &&
        rule.selector.includes("[class*='card']") &&
        /background\s*:\s*[^;]*--dsh-glass-card/.test(rule.decls),
    )
    expect(fill, 'compat surfaces lost their translucent fill').toBeDefined()

    const rim = rules.filter(
      (rule) =>
        rule.selector.includes('[data-dsh-glass-compat]') &&
        /outline\s*:\s*1px solid var\(--dsh-glass-rim\)/.test(rule.decls),
    )
    expect(rim.length, 'compat surfaces lost their hairline rim').toBeGreaterThan(0)
    // The rim must step aside for the shared focus ring (outline vs outline);
    // given the same specificity, only `:not(:focus-visible)` keeps a11y intact.
    expect(rim.every((rule) => rule.selector.includes(':not(:focus-visible)'))).toBe(true)

    // Panels keep their blur but must NOT be filled: they nest (`panel` >
    // transparent `panelBody`), so filling both stacks two layers and paints an
    // inner rectangle the host never asked for (probed on the live GUI).
    const filledPanels = rules.filter(
      (rule) =>
        rule.selector.includes('[data-dsh-glass-compat]') &&
        rule.selector.includes("[class*='panel']") &&
        /(?:^|;)\s*background\s*:/.test(rule.decls),
    )
    expect(filledPanels.map((rule) => rule.selector), 'compat must not double-fill nested panels').toEqual([])
  })

  it('paints the selected sidebar row with a fill that is not the page ground (PP)', () => {
    // The sheet recipe (`--dsh-glass-card*`) is the SAME colour as the ground
    // (both --dsw-alias-bg-base), so over the solid ground it composites to a
    // pixel-identical fill — measured on the live GUI: 0 visible delta. A
    // selected row declared with it reads as "no background", which is exactly
    // the weak-feedback bug PP is about.
    const selected = rules.find((rule) => rule.selector.includes("[role='treeitem'][aria-selected='true']"))
    expect(selected, 'the selected sidebar row lost its rule').toBeDefined()
    expect(/background\s*:\s*[^;]*--dsw-specific-sidebar-nav-item-active/.test(selected?.decls ?? '')).toBe(true)
    expect(/background\s*:\s*var\(--dsh-glass-card/.test(selected?.decls ?? '')).toBe(false)
  })
})
