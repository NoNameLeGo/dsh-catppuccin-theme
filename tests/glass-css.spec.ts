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
 * the flat area renders pixel-for-pixel unchanged (measured: 0 differing
 * interior pixels; only the element's own antialiased edge shifts ±1/255 — see
 * `docs/plugin-improvements.md`) while the GPU is still billed. Issue #13
 * measured exactly that: ~80% GPU on the 3D engine during streaming with mica,
 * <30% with compat, and no sensitivity to the blur slider.
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
})
