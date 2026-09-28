// @vitest-environment jsdom
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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Resolved to a STRING path on purpose: this spec runs under jsdom, where the
// global `URL` is jsdom's own implementation, and handing that object to
// `fs.readFileSync` fails with "The URL must be of scheme file".
const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client', 'glass', 'glass.module.css'),
  'utf8',
)

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
    // the surface still read as stock DSH. The material has to be the fill + rim
    // — carried by the composer card, the one compat surface family with both a
    // stable host hook and a floating job (issue #17 narrowed it there from the
    // `card` substring).
    const fill = rules.find(
      (rule) =>
        rule.selector.includes('[data-dsh-glass-compat]') &&
        rule.selector.includes('[data-composer-card]') &&
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

  it('never blurs the host right-sidebar wrapper once it is closed (issue #16)', () => {
    // `[class*='panel']` is a substring match, and DSH's CSS Modules emit
    // `P3OORG_panel` / `P3OORG_panelBody` for the RIGHT SIDEBAR's container
    // (`@deepseek-ai/dsh-client-ui-sidebar-right`, verified in 0.1.7-rc.1 and
    // -rc.2). That container is a transparent layout wrapper — `position:
    // absolute; pointer-events: none`, no `background` declaration at all —
    // and it STAYS in the DOM after the sidebar closes: only its child dock is
    // moved out and hidden. The blur therefore kept painting ~300×518px of
    // frost at the window's right edge (the reporter's live reading: computed
    // `backdrop-filter: blur(12px)`, `x=1156 y=0 w=300 h=518`).
    //
    // The fixture below is upstream's markup verbatim (`SidebarRight.tsx`):
    // `data-sidebar-right-panel` is ALWAYS present; `data-sidebar-right-open`
    // is `expanded || void 0` (gone on close) and `aria-hidden` is its
    // inverse. Assertions run through real `querySelectorAll` against the
    // sheet's own selectors, so they lock the MATCH, not a selector spelling.
    //
    // `#outside` used to be the control proving the `:not()` was not silently
    // ignored. Issue #17 removed the generic `[class*='panel']` selector
    // outright (see the #17 case below), so `#outside` is now the control for
    // the OPPOSITE claim: an element carrying the stock class but none of the
    // host hooks must NOT be frosted. Both directions are asserted, so a
    // re-added generic selector fails loudly instead of silently returning.
    const fixture = (open: boolean): HTMLElement => {
      document.body.innerHTML =
        '<div data-dsh-glass-compat>' +
        '<div class="abc123_panel" id="outside"></div>' +
        '<div class="P3OORG_panel" data-sidebar-right-panel="push" ' +
        (open ? 'data-sidebar-right-open=""' : 'aria-hidden="true"') +
        '>' +
        '<div class="P3OORG_panelBody"><div class="abc123_panel" id="inside"></div></div>' +
        '</div></div>'
      return document.querySelector('.P3OORG_panel') as HTMLElement
    }
    /** True when any blurring rule in the sheet matches this element. */
    const blurred = (el: Element): boolean =>
      blurring.some((rule) => {
        try {
          return [...document.querySelectorAll(rule.selector)].includes(el)
        } catch {
          return false // jsdom lacks some combinators (`:has`), which none of these need
        }
      })

    // Control first: the fixture must still be something the OLD bare
    // substring would have hit (outside panel + wrapper + panelBody + inner
    // panel), otherwise this test proves nothing.
    fixture(false)
    expect(document.querySelectorAll("[data-dsh-glass-compat] [class*='panel']").length).toBe(4)

    for (const open of [true, false]) {
      const panel = fixture(open)
      const body = panel.firstElementChild as HTMLElement
      const inside = document.getElementById('inside') as HTMLElement
      const outside = document.getElementById('outside') as HTMLElement
      expect(blurred(panel), `wrapper blur, open=${open}`).toBe(open)
      expect(blurred(body), `panelBody blur, open=${open}`).toBe(open)
      expect(blurred(inside), `panel inside the wrapper, open=${open}`).toBe(open)
      expect(blurred(outside), `panel outside the wrapper, open=${open}`).toBe(false)
    }

    // Narrowing the panel family must not take the other compat surfaces with
    // it. Issue #17 moved the card family onto the composer card's own hook, so
    // that is the surface this checks (a bare `*_card` class is deliberately
    // NOT frosted any more — see the #17 case below).
    document.body.innerHTML = '<div data-dsh-glass-compat><div data-composer-card></div></div>'
    expect(blurred(document.querySelector('[data-composer-card]') as HTMLElement)).toBe(true)
    document.body.innerHTML = ''
  })

  it('keeps the row-level and token-owned families out of compat (issue #17)', () => {
    // Issue #17: a substring selector cannot tell a SURFACE from a row-level
    // container inside one, so three families left the compat rule sets. Each
    // removal is locked here by its own reason — all three are "the rule was
    // drawing something the host never drew", not taste.
    const compat = rules.filter((rule) => rule.selector.includes('[data-dsh-glass-compat]'))
    const withCompat = compat.map((rule) => rule.selector)

    // C — `panel` survives ONLY as the host right sidebar's open state, which
    // is the one panel with evidence for a blur (issue #16). Panels are never
    // filled, so a generic blur on them painted nothing over the solid ground
    // and only ever showed up on row-level `*panel*` containers of other
    // plugins (the reporter's hard-edged block over an 8% row highlight).
    const panelRules = withCompat.filter((selector) => selector.includes("[class*='panel']"))
    expect(panelRules.length, 'the generic panel family came back').toBe(1)
    expect(panelRules.every((selector) => selector.includes('[data-sidebar-right-open]'))).toBe(true)

    // B — the native tooltip paints `--dsw-alias-tooltip-bg` itself; filling it
    // replaced a token the design owns, at a large-surface grade.
    expect(
      withCompat.some((selector) => selector.includes("[role='tooltip']")),
      'compat frosts tooltips again',
    ).toBe(false)

    // A2 + A1/A3 — the `card` substring is gone: an offline sweep of every
    // `*_card` class in the shipped client packages (0.1.7-rc.2) found 18 of 20
    // declaring their OWN `background` (so the skin was replacing a design token,
    // and their own fill already covered the blur) and 2 declaring none (so the
    // rule was the only thing drawing them — the reported grey row stripes).
    // The composer card is the one that has a stable hook AND floats over moving
    // content, so it is the only card the compat material names.
    expect(
      withCompat.some((selector) => selector.includes("[class*='card']")),
      'the card substring came back',
    ).toBe(false)
    const composerRules = withCompat.filter((selector) => selector.includes('[data-composer-card]'))
    expect(composerRules.length, 'the composer card lost its compat material').toBe(3)
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
