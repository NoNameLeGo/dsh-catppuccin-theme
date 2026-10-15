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
 *    composer, edge fades) must keep it — deleting those would be a silent
 *    downgrade of the skin instead of a performance fix. Menus are on that
 *    side of the line too, but since issue #22 their blur rides MenuSurface's
 *    OWN material plane (`--dsw-menu-backdrop-filter`), so the needle for
 *    them lives in the "menu seat" block below instead of a literal
 *    `backdrop-filter` declaration.
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

/** Selectors whose backdrop is genuinely moving/heterogeneous content.
 *  The composer blurs from its `::before` material plane, not from the element
 *  itself (issue #19) — the element hosts the trigger palette, so a blur on it
 *  would be that palette's backdrop root. (Menus are asserted separately in
 *  the issue #22 block: their blur moved onto upstream's own material plane.) */
const VISIBLE = ['header', '[data-composer-card]::before', '[data-dsh-glass-fade]']

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

  it('drops the TOP fade on the Windows desktop caption strip (and only there)', () => {
    // Official DSH Desktop marks <html> with `data-windows-titlebar` and reserves
    // 40px above every column; nothing scrolls under it, so the top band's blur
    // is an identity read (issue #13) and its veil seams against the native
    // caption, which the shell colours from the same sidebar-fill token.
    const top = rules.find(
      (rule) =>
        rule.selector.includes('[data-windows-titlebar]') &&
        rule.selector.includes("data-dsh-glass-fade='top']"),
    )
    expect(top?.selector, 'missing the Windows caption guard').toBeDefined()
    expect(top!.selector, 'the guard must not hit the bottom band').not.toContain("fade='bottom'")
    expect(/display\s*:\s*none/.test(top!.decls), 'the band must be removed, not just hidden').toBe(
      true,
    )
    // The generic bands (web, macOS) keep their veil: the shared rule still
    // blurs, and the top band still carries its mask.
    expect(
      blurring.some((rule) => rule.selector === '[data-dsh-glass] [data-dsh-glass-fade]'),
    ).toBe(true)
    expect(
      rules.some(
        (rule) =>
          rule.selector === "[data-dsh-glass] [data-dsh-glass-fade='top']" &&
          rule.decls.includes('mask-image'),
      ),
    ).toBe(true)
  })

  it('keeps composer hosts blur-free — the material rides the plane (no double read)', () => {
    const erasers = rules.filter((rule) => blurOf(rule.decls) === 'none')
    expect(erasers.length).toBeGreaterThanOrEqual(1)
    expect(
      erasers.some(
        (rule) =>
          rule.selector.includes('[data-composer-card]') && !rule.selector.includes('::before'),
      ),
    ).toBe(true)
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
    // NOT frosted any more — see the #17 case below). Issue #19 moved the blur
    // onto the card's `::before` plane, and jsdom's `querySelectorAll` cannot
    // address pseudo-elements — so this locks the RULE MATCH shape instead: the
    // compat material must still name the composer card, on a plane.
    expect(
      rules.some(
        (rule) =>
          rule.selector.includes('[data-dsh-glass-compat]') &&
          rule.selector.includes('[data-composer-card]::before') &&
          blurOf(rule.decls) === 'blur(12px)',
      ),
      'the compat composer lost its material plane',
    ).toBe(true)
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
    // Round 3 (①, 2026-10-13): it must ride the EXACT token the app's own
    // panel rows use for active (`hHd-Xa_panelRow.hHd-Xa_panelActive` in
    // dsh-client-ui-sidebar), so the session row and the 「插件」 row read as
    // one selected colour.
    expect(/background\s*:\s*var\(--dsw-alias-interactive-bg-hover\)/.test(selected?.decls ?? '')).toBe(true)
    expect(/background\s*:\s*var\(--dsh-glass-card/.test(selected?.decls ?? '')).toBe(false)
  })

  it('gates the entry animations on the layer, never on the mode (2026-10-01)', () => {
    // Reported: "switching mica/compat sometimes flashes". An animation whose
    // `animation-name` follows the MODE restarts whenever `data-dsh-glass-float`
    // goes back on — the computed name flips none → keyframes on every element
    // that is already on screen, so the page and the open settings dialog replay
    // their entry fade. Chromium, against the shipped sheet, 50ms after the
    // flip: dialog opacity 0.149, active phase 0.085. The gate must therefore be
    // `[data-dsh-glass]` (stable while the layer is on), and compat must keep
    // the stock look by zeroing the CLOCK (`animation-duration` via
    // `--dsh-glass-entry-scale`) — changing an animation property other than
    // `animation-name` does not restart it (measured: opacity stays 1.000).
    const entry = rules.filter((rule) =>
      /animation\s*:[^;]*(dsh-glass-in|dsh-glass-rise|dsh-glass-dialog-in)/.test(rule.decls),
    )
    expect(entry.length, 'the entry animations changed count — re-check the gate').toBe(3)
    for (const rule of entry) {
      expect(
        rule.selector,
        'a mode-gated entry animation restarts on every compat→mica flip',
      ).not.toContain('data-dsh-glass-float')
      expect(rule.selector).toContain('[data-dsh-glass]')
      expect(rule.decls, `${rule.selector} must scale its duration, not its name`).toContain(
        '--dsh-glass-entry-scale',
      )
    }

    // issue #24 (2026-10-15): the conversation roots must carry NO animation at
    // all. Upstream re-mounts the whole `[data-phase]` subtree (== the
    // `div.wSkVaW_root` conversation column, header card and composer card
    // included) on EVERY conversation switch — `main.conversation` is a
    // `session-maybe` slot keyed by the session-generation epoch
    // (`useMaybeIncarnation(binding)` in dsh-client-ui-renderer) — so a fresh
    // element is inserted per switch and any animation declared on it replays:
    // measured on the live GUI, `animationstart: dsh-glass-in` fired 39~63 ms
    // after the click and the column faded in from opacity 0 for 300 ms, i.e.
    // the reported glass "flicker". Stock declares no animation there, and the
    // phase roots are switch-driven, not entry-driven. Evidence:
    // docs/issue-24-switch-flicker.md.
    const phaseAnims = rules.filter(
      (rule) => /animation\s*:/.test(rule.decls) && rule.selector.includes('[data-phase'),
    )
    expect(
      phaseAnims.map((rule) => rule.selector),
      'the conversation roots must never animate — they are re-mounted per switch (issue #24)',
    ).toEqual([])

    // The clock itself: 1 in mica, 0 in compat (the compat rule wins on source
    // order at equal specificity, so it must come after).
    const scaleRule = (selector: string): string => {
      const rule = rules.find((candidate) => candidate.selector === selector)
      expect(rule, `missing ${selector}`).toBeDefined()
      return rule?.decls ?? ''
    }
    expect(scaleRule('[data-dsh-glass]')).toContain('--dsh-glass-entry-scale: 1')
    expect(scaleRule('[data-dsh-glass-compat]')).toContain('--dsh-glass-entry-scale: 0')
    expect(rules.findIndex((rule) => rule.selector === '[data-dsh-glass-compat]')).toBeGreaterThan(
      rules.findIndex((rule) => rule.selector === '[data-dsh-glass]'),
    )

    // Reduced motion keeps killing the same animations — on the NEW gate, or a
    // mode flip would silently re-arm them for reduced-motion users.
    const reduced = rules.filter((rule) => /(?:^|;)\s*animation\s*:\s*none/.test(rule.decls))
    expect(reduced.length).toBeGreaterThan(0)
    for (const rule of reduced) {
      expect(rule.selector, 'reduced motion still keys off the mode gate').not.toContain(
        'data-dsh-glass-float',
      )
    }
  })
})

describe('menu seat + un-stroked highlights (issue #22)', () => {
  // Context (reporter's screenshots retained in `.debug/issue-22/`):
  //  - The model-parade picker flips the ARIA roles in 0.2.0
  //    (`dsh-client-ui-model-selection/lib/client.js`: `pane === "model" ?
  //    "group" : "menu"`), so the recipe written for `[role='menu']` landed on
  //    the INNER scrolling list — a second 1px frame inside the real card,
  //    with the last model's capsule flush against its bottom edge (the
  //    reporter's 「双层边框 + 贴底」).
  //  - The sidebar's right edge was the only edge with an accent override
  //    ("luminous right edge"); in Latte it read as a half-drawn box whose
  //    corners hooked around the rounded arcs.
  //  - The two 1px inset rings (selected conversation row, hovered menu cell)
  //    were the last strokes in the highlight vocabulary; the reporter asked
  //    for one un-stroked fill everywhere.
  const menuSeat = rules.filter((rule) =>
    rule.selector.includes("[data-menu-material='translucent']"),
  )

  it('seats the menu glass on MenuSurface\'s material plane, both modes', () => {
    const float = menuSeat.find(
      (rule) =>
        rule.selector.includes('data-dsh-glass-float') &&
        /--dsw-menu-surface-fill\s*:\s*var\(--dsh-glass-card-raised\)/.test(rule.decls) &&
        /--dsw-menu-backdrop-filter\s*:\s*blur\(var\(--dsh-glass-blur/.test(rule.decls),
    )
    expect(float?.selector, 'mica menus lost their plane seat (fill + blur)').toBeDefined()
    const compat = menuSeat.find(
      (rule) =>
        rule.selector.includes('data-dsh-glass-compat') &&
        /--dsw-menu-backdrop-filter\s*:\s*blur\(12px\)/.test(rule.decls),
    )
    expect(compat?.selector, 'compat menus lost their plane seat').toBeDefined()
    // The seat must paint nothing on the surface itself: a backdrop-filter
    // there would become the plane's backdrop root (the issue #19 shape) and
    // a fill there would sit UNDER the plane and become what the plane's
    // blur reads.
    for (const rule of menuSeat) {
      expect(blurOf(rule.decls), `${rule.selector} puts a filter on the surface`).toBeUndefined()
      expect(
        /(?:^|;)\s*background\s*:/.test(rule.decls),
        `${rule.selector} paints a fill on the surface`,
      ).toBe(false)
      expect(
        /outline\s*:/.test(rule.decls),
        `${rule.selector} paints a stroke on the surface (round 3 ②a removed the rim)`,
      ).toBe(false)
    }
  })

  it('never styles a bare [role=menu] — the model list wears that role since 0.2.0', () => {
    const menuRules = rules.filter((rule) => rule.selector.includes("[role='menu']"))
    expect(menuRules.length).toBeGreaterThan(0)
    for (const rule of menuRules) {
      for (const part of rule.selector.split(',').map((piece) => piece.trim())) {
        if (!part.includes("[role='menu']")) continue
        expect(part, 'must not style a MenuSurface surface through the ARIA role').toContain(
          ':not([data-menu-material])',
        )
        expect(part, "must not style anything inside a surface (the model picker's inner list)").toContain(
          ':not([data-menu-material] *)',
        )
      }
    }
  })

  it('keeps the sidebar border uniform — no accent right edge', () => {
    const sidebar = rules.filter((rule) => rule.selector.includes('sidebarCol'))
    expect(sidebar.length).toBeGreaterThan(0)
    expect(
      sidebar.filter((rule) => /border-right-color/.test(rule.decls)).map((rule) => rule.selector),
      'issue #22 c1: the accent right edge read as a half-drawn frame in Latte',
    ).toEqual([])
    expect(
      sidebar.some((rule) => /border\s*:\s*1px solid var\(--dsh-glass-rim\)/.test(rule.decls)),
      'the sidebar lost its uniform rim',
    ).toBe(true)
  })

  it('keeps highlights un-stroked: no 1px inset rings on rows or menu cells', () => {
    const selectedRow = rules.find((rule) =>
      rule.selector.includes("[role='treeitem'][aria-selected='true']"),
    )
    expect(selectedRow?.decls, 'the selected row grew a stroke back').not.toContain('inset')
    expect(selectedRow?.decls, 'the selected row grew its glow back (round 3 ①)').not.toContain('box-shadow')
    const hover = rules.find((rule) => rule.selector.includes("[role='menuitem']:hover"))
    expect(hover?.decls, 'the hover light grew a stroke back').not.toContain('inset')
  })

  it('styles the group heading, not the group sentinel (pill re-hook)', () => {
    // 0.2.0 prepends a 1×1 `span[data-menu-group-start]` (opacity: 0) to every
    // MenuGroup section, so the old `> :first-child` arm drew the pill on an
    // invisible span and the heading rendered as plain text.
    const pill = rules.find((rule) => rule.decls.includes('border-radius: 999px'))
    expect(pill?.selector, 'the provider-group pill lost its rule').toBeDefined()
    expect(pill!.selector, 'must target the heading hook').toContain('[data-menu-group-heading]')
    expect(pill!.selector, ':first-child hits the 0.2.0 sentinel span').not.toContain(':first-child')
    expect(pill!.decls, 'the provider pill grew a frame back (round 3 ③)').not.toMatch(/border\s*:\s*1px/)
    expect(pill!.decls, 'the pill lost its sticky-cover blur').toContain('backdrop-filter')
  })
})

describe('main input surface rim (issue #22 follow-up)', () => {
  // The composer card (hero and session views share the same rule — the fused
  // slab was removed 2026-10-13) sits FLAT on the solid page ground with a
  // fill all but identical to it, so the generic 18% rim measured as an
  // invisible boundary there (rim ≈ rgb(210,212,220) on the
  // rgb(239,241,245) Latte ground, ΔRGB ≤ 31 at 1x — reporter's config,
  // 2026-10-11 CDP evidence). It rides the dedicated `--dsh-glass-rim-strong`
  // step; every other rim consumer keeps the base token, whose 18% is right
  // wherever a drop shadow or a layer step does part of the separating.
  const lightVars = rules.find(
    (rule) => rule.selector === '[data-dsh-glass] body' && rule.decls.includes('--dsh-glass-rim:'),
  )
  const darkVars = rules.find((rule) => rule.selector === '[data-dsh-glass] body[data-ds-dark-theme]')

  const strongPct = (decls: string | undefined): number | undefined => {
    const value = decls === undefined ? undefined : /--dsh-glass-rim-strong\s*:\s*([^;]+)/.exec(decls)?.[1]
    return value === undefined ? undefined : Number(/(\d+)%/.exec(value)?.[1])
  }

  it('defines --dsh-glass-rim-strong in both scheme blocks, dark never below light', () => {
    const light = strongPct(lightVars?.decls)
    const dark = strongPct(darkVars?.decls)
    expect(light, 'the light block lost the strong rim').toBeDefined()
    expect(dark, 'the dark block lost the strong rim').toBeDefined()
    expect(dark!, 'the dark step must never sit below the light one (same alpha reads weaker on a dark ground)')
      .toBeGreaterThanOrEqual(light!)
  })

  it('confines the strong step to the composer card', () => {
    const consumers = rules.filter((rule) => rule.decls.includes('var(--dsh-glass-rim-strong)'))
    expect(
      consumers.map((rule) => rule.selector).sort(),
      'exactly the composer card rides the strong rim (hero and session share the rule)',
    ).toEqual(['[data-dsh-glass-float] [data-composer-card]'])
  })

  it('keeps every other rim consumer on the base token (no global swap)', () => {
    // Spot checks the two surfaces the reporter's screenshots key on: the
    // top-bar card and the sidebar column stay at the 18% ink rim.
    const topBar = rules.find(
      (rule) => rule.selector.includes('[data-phase] header') && /border\s*:\s*1px solid/.test(rule.decls),
    )
    expect(topBar?.decls, 'the top-bar card rim moved off the base token')
      .toContain('border: 1px solid var(--dsh-glass-rim)')
    const sidebar = rules.filter(
      (rule) => rule.selector.includes('sidebarCol') && /border\s*:\s*1px solid/.test(rule.decls),
    )
    expect(sidebar.length, 'the sidebar lost its rim').toBeGreaterThan(0)
    for (const rule of sidebar) {
      expect(rule.decls, `${rule.selector} must keep the base rim`).toContain('border: 1px solid var(--dsh-glass-rim)')
    }
  })
})

describe('backdrop-root hygiene: the trigger-palette host stays filter-free (issue #19)', () => {
  // Why this is a hard rule and not a taste call.
  //
  // DSH mounts the slash-command palette (`div[data-trigger-menu]`,
  // `dsh-client-ui-input-trigger`) into the `conversation.input.overlay` slot,
  // and `InputBar` renders that slot as the FIRST CHILD of `[data-composer-card]`
  // (`.overlayAnchor`, `height:0; position:absolute`) — verified in 0.1.7-alpha.2,
  // -rc.2 and 0.2.0-rc.2. The palette itself is `bottom: calc(100% + 4px)`, so it
  // hangs ENTIRELY ABOVE the card's box, over the transcript.
  //
  // A `backdrop-filter` on the card (mica) — or on `[data-dsh-glass-inputbar]`,
  // the wrapper around it (slab) — makes that element the palette's BACKDROP
  // ROOT. A backdrop root's descendants may only read their ancestor's own
  // paint; the page is not in it, and the palette's own region is outside the
  // card's box anyway, so the region reads EMPTY. The palette's
  // `backdrop-filter: var(--dsw-menu-backdrop-filter)` (`blur(40px)
  // saturate(150%)`, upstream ui-theme) then paints nothing while its 58%/45%
  // fill stays — the reporter's issue #19 (transcript legible straight through
  // the command menu).
  //
  // Measured in Chromium against this exact structure (`.debug/issue-19/`):
  //  - stripe stdev inside the palette, filtered ancestor vs not: 100.41 vs 7.04
  //    (the first value is byte-identical to the same crop with the palette's own
  //    blur removed — an identity read);
  //  - full-page A/B with the shipped sheet, reporter settings (mica, blur 2,
  //    frost 20, Latte): palette band 31.58 (before) → 0.00 (after), while the
  //    bare-transcript control stayed 76.32 and removing the palette's own blur
  //    put it back to 32.06.
  const HOSTS = ['[data-composer-card]', '[data-dsh-glass-inputbar]']

  it('never puts a backdrop-filter on a container that hosts a floating overlay', () => {
    const offenders = blurring.filter((rule) =>
      HOSTS.some((host) => rule.selector.includes(host) && !rule.selector.includes('::before')),
    )
    expect(
      offenders.map((rule) => rule.selector),
      'issue #19: this element hosts the trigger palette, so a blur on it is the palette\'s backdrop root — move the material to its ::before plane',
    ).toEqual([])
  })

  it('keeps the composer material on a ::before plane that owns the fill too', () => {
    // The plane must carry the FILL, not just the blur: anything the host paints
    // below the plane (a background, an inset shadow) becomes what the plane
    // reads. One active plane per mode (mica card, compat card) — the fused
    // slab was removed 2026-10-13, so the card's plane is the single composer
    // plane in both views (nothing left to erase).
    const planeRules = rules.filter(
      (rule) =>
        rule.selector.includes('::before') && HOSTS.some((host) => rule.selector.includes(host)),
    )
    const active = planeRules.filter((rule) => {
      const blur = blurOf(rule.decls)
      return blur !== undefined && blur !== 'none'
    })
    const erased = planeRules.filter((rule) => /(?:^|;)\s*display\s*:\s*none/.test(rule.decls))
    expect(active.map((rule) => rule.selector)).toHaveLength(2)
    expect(erased.map((rule) => rule.selector)).toEqual([])
    for (const plane of active) {
      expect(
        /(?:^|;)\s*background\s*:/.test(plane.decls),
        `${plane.selector} must own the fill (a fill left on the host enters the plane's backdrop)`,
      ).toBe(true)
    }
    // …and the hosts themselves must not paint a fill either, for the same
    // reason. `none` / `transparent` are the required erasers of the host's own
    // `--dsw-specific-input-major`; anything opaque would hide the plane.
    for (const host of HOSTS) {
      const hostRules = rules.filter(
        (rule) => rule.selector.includes(host) && !rule.selector.includes('::before'),
      )
      for (const rule of hostRules) {
        const background = /(?:^|;)\s*background\s*:\s*([^;]+)/.exec(rule.decls)?.[1]?.trim()
        if (background === undefined) continue
        expect(
          background,
          `${rule.selector} paints a fill under its own material plane`,
        ).toMatch(/^(?:none|transparent)$/)
      }
    }
  })
})

describe('the top-bar card selector stays off the page head (issue #21)', () => {
  // The app ships exactly two <header> elements, and only one of them is a card.
  //
  //  - `wSkVaW_header` — the conversation top bar, mounted inside `[data-phase]`
  //    (`hero` / `active` / `plain`). It is the surface the floating card recipe
  //    was written for: it floats over the scrolling transcript.
  //  - `X_2TxG_pageHead` — a PAGE head, e.g. the plugin page's 「添加插件」
  //    toolbar (dsh-client-ui-plugin-manager; dsh-client-ui-schedule ships the
  //    same shell under its own hash). Stock declares no border, no fill and
  //    `padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px))`, and its
  //    ancestors carry no `[data-phase]`.
  //
  // A bare `header` tag selector matched both. On the page head the 12px outer
  // margin + 10px padding + rim turned an invisible layout box into a card and
  // pulled the toolbar 11px from the card's top edge against 29px from its
  // bottom one (live GUI, mocha + mica, 1440x900@2x: card y 12..84, toolbar
  // y 23..55 — the reporter's issue #21). It also handed the page head the
  // collapsed-rail `margin-left: 28px` and discarded the Windows/macOS
  // `--dsh-frame-top-clearance`. `[data-phase]` is the seam: scoping to it
  // keeps the top bar's geometry byte-identical and gives the page head back
  // its stock box (measured: stripping `data-dsh-glass*` at runtime reproduces
  // the same numbers).
  const gated = rules.filter((rule) => rule.selector.includes('data-dsh-glass-float'))

  it('never selects a bare header tag under the float gate', () => {
    const offenders = gated.filter((rule) =>
      rule.selector
        .split(',')
        .map((part) => part.trim())
        .some((part) => /(?:^|\s)header(?![\w-])/.test(part) && !/\[data-phase/.test(part)),
    )
    expect(
      offenders.map((rule) => rule.selector),
      'issue #21: a bare `header` also matches the page head — scope it to [data-phase]',
    ).toEqual([])
  })

  it('still styles the conversation top bar as a card, collapse rule included', () => {
    const card = rules.find(
      (rule) =>
        rule.selector === '[data-dsh-glass-float] [data-phase] header' &&
        /border\s*:\s*1px solid/.test(rule.decls),
    )
    expect(card, 'the conversation top bar lost its card recipe').toBeDefined()
    expect(blurOf(card!.decls), 'the top bar floats over the transcript — it keeps its blur')
      .toBe('blur(var(--dsh-glass-blur, 14px))')
    expect(
      rules.some(
        (rule) =>
          rule.selector ===
            '[data-dsh-glass-float] [data-dsh-glass-frame][data-sidebar-collapsed] [data-phase] header' &&
          /margin-left\s*:\s*28px/.test(rule.decls),
      ),
      'the collapsed rail must still step the top bar right — and only the top bar',
    ).toBe(true)
  })
})
