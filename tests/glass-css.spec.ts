// @vitest-environment jsdom
/**
 * Glass blur budget guard (issue #13).
 *
 * `backdrop-filter` is not free: any value other than `none` promotes the
 * element to a compositing layer whose backdrop is re-read every frame — the
 * blur radius is irrelevant, and `blur(0px)` costs the same as `blur(20px)`.
 * That only pays for itself where the surface actually covers CHANGING content.
 *
 * This skin paints an AMBIENT page ground (`glass.module.css`, the body rule —
 * since issue #25 a same-family wash plus two low-alpha glows; before that a
 * single flat colour). Either way the field is LOW-FREQUENCY — a gradient with
 * a hundreds-of-px period, which `blur(≤40px)` cannot visibly move — so every
 * surface that floats over nothing but that ground blurs an identity —
 * measured when the ground was still flat (issue #13), the frosted fill was
 * pixel-identical with the blur removed (0 of 19184 pixels once the surface's
 * own content is hidden); the only pixels that move are the glyphs drawn above
 * it, which get re-antialiased because the surface becomes a composited layer
 * (≤16/255 on the sidebar sheet, ≤64/255 on a chat bubble). Issue #13 measured
 * the bill for that: ~80% GPU on the 3D engine during streaming with mica,
 * <30% with compat, and no sensitivity to the blur slider.
 *
 * The guard below locks the two halves of the answer:
 *  - surfaces over the ground field (sidebar sheet, chat bubbles, trajectory
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
import { DEFAULT_GLASS } from '../src/state.ts'

// Resolved to a STRING path on purpose: this spec runs under jsdom, where the
// global `URL` is jsdom's own implementation, and handing that object to
// `fs.readFileSync` fails with "The URL must be of scheme file".
const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client', 'glass', 'glass.module.css'),
  'utf8',
)

/** Selectors known to sit over the page ground field (issue #13; ambient
 *  since issue #25 — the field stays low-frequency, so the blur verdict is
 *  unchanged). `ground-sample` is the settings strip that IS the ground (see
 *  the "settings ground sample" block): a blur on it would be the worst case
 *  of the same waste. */
const GROUND_ONLY = /sidebarCol|bubble|trajectory|ground-sample/

/** The individual selectors of a rule (a rule may carry a selector LIST — the
 *  ground rule does, since it paints both <body> and the settings strip). */
const selectorList = (selector: string): string[] => selector.split(',').map((part) => part.trim())

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

describe('ground ambience (issue #25, revised by #26)', () => {
  // The ground used to be a single flat colour, so every glass pane read as
  // "the same colour as the page": the card fill is layer-1 @ α over bg-base —
  // ΔRGB ≤ 2/255 on the dark flavours at the default frost and EXACTLY 0 on
  // Latte (layer-1 === bg-base). Issue #25 added an ambient field the
  // translucent fills can TRANSMIT; reverting to a flat fill must fail loudly.
  // Evidence and the reasoning: docs/issue-25-ambient-ground.md.
  //
  // 2026-10-16 (issue #26): the two radial GLOWS became OPT-IN. They are pinned
  // to screen coordinates while the panes sit elsewhere, so every pane transmits
  // a DIFFERENT slice of them — measured on the live page, one sidebar card read
  // ΔRGB (12,15,21) between its own top and bottom with the glows on, and
  // ≤(4,4,5) across the window with the wash alone ("三块玻璃读出三种底色").
  // The WASH stays unconditional — it is the depth cue, horizontally uniform to
  // ≤2/255 — and the glows are gated on the 光斑 switch through
  // `--dsh-glass-glow`, whose shipped default is 0.
  const ground = rules.find(
    (rule) =>
      selectorList(rule.selector).includes('[data-dsh-glass] body') &&
      /(?:^|;)\s*background\s*:/.test(rule.decls),
  )

  it('keeps the wash unconditional and never a flat fill again', () => {
    expect(ground, 'the ground background rule disappeared').toBeDefined()
    expect(ground!.decls, 'the ground lost its same-family wash').toMatch(/linear-gradient/)
    // The wash's ambience weighting must live in the `background` rule itself,
    // USED directly — an intermediate custom property did NOT follow
    // `--dsh-glass-ambience` when the knob moved on the live GUI (probed
    // 2026-10-15). Keep it inline; and it must NOT read the glow switch: the
    // wash is what #26 keeps, the glows are what it gates.
    expect(ground!.decls, 'the wash must weight itself by the ambience scale').toMatch(
      /var\(--dsh-glass-wash-mix\)\s*\*\s*var\(--dsh-glass-ambience\)/,
    )
    const wash = /linear-gradient\(([^;]*)\)\s*;/.exec(ground!.decls)?.[1] ?? ''
    expect(
      wash,
      'the wash must stay independent of the glow switch — it IS the issue #26 default',
    ).not.toContain('--dsh-glass-glow')
  })

  it('gates both glows on the opt-in switch, keeping their hues on mapped tokens', () => {
    // The glows stay in the sheet (the switch must be able to restore the
    // 0.6.3-beta.0 look), but every glow alpha carries the glow knob AND the
    // ambience scale, inline in `background`.
    const radials = (ground!.decls.match(/radial-gradient\([^;]*?(?=,\s*(?:radial|linear)-gradient|$)/g) ?? [])
      .map((part) => part.trim())
    expect(radials.length, 'expected the two glow layers to remain in the sheet').toBe(2)
    expect(ground!.decls, 'glow 1 moved off the brand token').toContain(
      'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
    )
    expect(ground!.decls, 'glow 2 moved off the success token').toContain(
      'var(--dsw-alias-state-success-tertiary)',
    )
    for (const [index, radial] of radials.entries()) {
      expect(radial, `glow ${index + 1} ignores the glow switch`).toContain('var(--dsh-glass-glow')
      expect(radial, `glow ${index + 1} must fade with the ambience`).toContain('var(--dsh-glass-ambience)')
    }
  })

  it('ships the glow switch OFF — the reported look is wash-only', () => {
    // The default IS the fix: a user who changes nothing gets the wash-only
    // ground. Reading the same constant the layer writes into
    // `--dsh-glass-glow` keeps the two from drifting apart.
    expect(
      DEFAULT_GLASS.glow,
      'the glows came back on by default — that is exactly the issue #26 report',
    ).toBe(false)
  })

  it('keeps the brightness knob authoritative: ambience fades at the extremes', () => {
    // --dsh-glass-ground carries the brightness mix (the one stop the knob
    // moves) and --dsh-glass-ambience = 1 − white − black, purely in CSS:
    // exactly one fraction is non-zero (glass-layer.ts writes them), so a
    // maxed-out slider collapses back to the pure-white / pure-black ground.
    const groundVar = rules.find((rule) => /--dsh-glass-ground\s*:/.test(rule.decls))
    expect(groundVar, 'the ground base variable disappeared').toBeDefined()
    expect(groundVar!.decls).toContain('--dsh-glass-brightness-white')
    expect(groundVar!.decls).toContain('--dsh-glass-brightness-black')

    const ambience = rules.find((rule) => /--dsh-glass-ambience\s*:/.test(rule.decls))
    expect(ambience, 'the ambience scale variable disappeared').toBeDefined()
    expect(ambience!.decls, 'the ambience scale stopped deriving from the knob').toMatch(
      /calc\([^)]*--dsh-glass-brightness-white/,
    )
    expect(ambience!.decls).toContain('--dsh-glass-brightness-black')

    // The wash's ambience weighting must live in the `background` rule
    // itself, USED directly — an intermediate custom property did NOT follow
    // `--dsh-glass-ambience` when the knob moved on the live GUI (probed
    // 2026-10-15: the property kept its folded weight while the glows, used
    // directly in `background`, collapsed correctly). Keep it inline.
    expect(ground!.decls, 'the wash must weight itself by the ambience scale').toMatch(
      /var\(--dsh-glass-wash-mix\)\s*\*\s*var\(--dsh-glass-ambience\)/,
    )
  })

  it('defines the wash for both schemes (the Latte ladder collapses)', () => {
    // On Latte `layer-1 === bg-base`, so a wash tinted by a layer token is a
    // no-op there — the light end must tint white; the dark flavours tint
    // bg-layer-1 instead. Dropping either arm re-flattens one scheme.
    const light = rules.find(
      (rule) => rule.selector === '[data-dsh-glass] body' && /--dsh-glass-wash-tint\s*:/.test(rule.decls),
    )
    const dark = rules.find(
      (rule) =>
        rule.selector === '[data-dsh-glass] body[data-ds-dark-theme]' &&
        /--dsh-glass-wash-tint\s*:/.test(rule.decls),
    )
    expect(light, 'the light-scheme wash tint disappeared').toBeDefined()
    expect(dark, 'the dark-scheme wash tint disappeared').toBeDefined()
    expect(light!.decls, 'the light wash must tint white (layer tokens collapse)').toMatch(
      /--dsh-glass-wash-tint\s*:\s*#ffffff/,
    )
    expect(dark!.decls, 'the dark wash must tint bg-layer-1').toMatch(
      /--dsh-glass-wash-tint\s*:\s*var\(--dsw-alias-bg-layer-1\)/,
    )
    // Both arms must carry a mix weight (the background rule consumes it).
    expect(light!.decls).toMatch(/--dsh-glass-wash-mix\s*:\s*[\d.]+%/)
    expect(dark!.decls).toMatch(/--dsh-glass-wash-mix\s*:\s*[\d.]+%/)
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
      // Round 3 ②a removed the stroke because it read as a solid frame in
      // LATTE; that verdict still holds for the light schemes. The 2026-10-19
      // frame-language audit ⑦ put the SOFT step back for DARK schemes only
      // (a popup over a dense transcript needs an edge to read), so the only
      // stroke this guard tolerates is that one, in the soft weight.
      if (/outline\s*:/.test(rule.decls)) {
        expect(
          rule.selector.includes('data-ds-dark-theme'),
          `${rule.selector} paints a stroke on the surface outside the dark branch`,
        ).toBe(true)
        expect(rule.decls, `${rule.selector} must use the soft rim step`).toMatch(
          /outline\s*:\s*1px solid var\(--dsh-glass-rim-soft\)/,
        )
      }
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
    // 2026-10-16 (issue #26 follow-up ②): the sidebar rides the SOFT step now
    // (see the rim block above); it is still one uniform rim on all four sides —
    // only the alpha moved, and it moved for the whole card at once.
    expect(
      sidebar.some((rule) => /border\s*:\s*1px solid var\(--dsh-glass-rim-soft\)/.test(rule.decls)),
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

describe('frame language: one rim ladder, one shadow language (2026-10-19 audit)', () => {
  // docs/frame-language-audit-2026-10-19.md. Four boxes were fixed in one
  // pass; each assertion below locks the DECISION, not the pixel, so a later
  // refactor that re-flattens the modal or re-inverts the rim hierarchy goes
  // red instead of shipping.
  const dialog = (mode: 'float' | 'compat') =>
    rules.find(
      (rule) =>
        rule.selector.includes(`data-dsh-glass-${mode}`) &&
        rule.selector.includes("[role='dialog'][aria-modal='true']"),
    )

  it('① gives the modal its drop shadow in BOTH modes — the top layer is not the flattest', () => {
    for (const mode of ['float', 'compat'] as const) {
      const rule = dialog(mode)
      expect(rule?.selector, `${mode} lost the modal surface rule`).toBeDefined()
      expect(rule!.decls, `${mode} modal has no drop shadow`).toMatch(
        /box-shadow\s*:[^;]*var\(--dsh-glass-drop\)/,
      )
      expect(rule!.decls, `${mode} modal lost the edge light`).toMatch(
        /box-shadow\s*:[^;]*var\(--dsh-glass-edge\)/,
      )
    }
  })

  it('③ puts the modal on the 20px step, leaving small dialogs at 14', () => {
    expect(dialog('float')!.decls, 'the modal is not on the 20px step').toMatch(
      /border-radius\s*:\s*20px/,
    )
    // The generic `[role='dialog']` step must survive for the small popups
    // (context meter) that share the role but are not full panels.
    const generic = rules.filter(
      (rule) =>
        rule.selector.includes("[role='dialog']") &&
        !rule.selector.includes('aria-modal') &&
        /border-radius\s*:\s*14px/.test(rule.decls),
    )
    expect(generic.length, 'small role=dialog popups lost their 14px step').toBeGreaterThan(0)
  })

  it('② never lets a control out-stroke the card it sits in', () => {
    // The seam is stamped on the new-session BUTTON, which lives inside the
    // sidebar card (issue #26 softened that card to the soft step). A base rim
    // here measured brighter than its own container.
    const surface = rules.filter((rule) => rule.selector.includes('[data-dsh-glass-surface]'))
    expect(surface.length).toBeGreaterThan(0)
    const stroked = surface.filter((rule) => /border\s*:/.test(rule.decls))
    expect(stroked.length, 'the new-session seam paints no rim at all').toBeGreaterThan(0)
    for (const rule of stroked) {
      expect(rule.decls, `${rule.selector} out-strokes the sidebar card it sits in`).toMatch(
        /border\s*:\s*1px solid var\(--dsh-glass-rim-soft\)/,
      )
    }
  })

  it('⑦ strokes menus in the dark branch only, and with the soft step', () => {
    const darkRim = rules.find(
      (rule) =>
        rule.selector.includes("[data-menu-material='translucent']") &&
        rule.selector.includes('data-ds-dark-theme') &&
        /outline\s*:/.test(rule.decls),
    )
    expect(darkRim?.selector, 'dark menus lost their rim').toBeDefined()
    expect(darkRim!.decls).toMatch(/outline\s*:\s*1px solid var\(--dsh-glass-rim-soft\)/)
    // Negative offset = painted inside the box, so the fill's corners and the
    // host's geometry are untouched.
    expect(darkRim!.decls).toMatch(/outline-offset\s*:\s*-1px/)
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

  it('keeps every OTHER rim consumer on the base token (sidebar soft, top bar base)', () => {
    // Spot checks the two surfaces the reporter's screenshots key on: the
    // top-bar card and the sidebar column stay at the 18% ink rim.
    const topBar = rules.find(
      (rule) => rule.selector.includes('[data-phase] header') && /border\s*:\s*1px solid/.test(rule.decls),
    )
    expect(topBar?.decls, 'the top-bar card rim moved off the base token')
      .toContain('border: 1px solid var(--dsh-glass-rim)')
    // 2026-10-16 (issue #26 follow-up ②): the sidebar card deliberately rides
    // the SOFT step now — the reporter read the base 18% arc at the window's
    // top-left as a pasted frame, and the chosen fix was to soften the outline
    // (not to un-float the card). The top bar above keeps the base rim, so this
    // stays a local decision, not a global swap.
    const sidebar = rules.filter(
      (rule) => rule.selector.includes('sidebarCol') && /border\s*:\s*1px solid/.test(rule.decls),
    )
    expect(sidebar.length, 'the sidebar lost its rim').toBeGreaterThan(0)
    for (const rule of sidebar) {
      expect(rule.decls, `${rule.selector} must ride the soft rim (② B)`).toContain('border: 1px solid var(--dsh-glass-rim-soft)')
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
        /\[data-dsh-glass-float\][^,]*\[data-phase\][^,]*header/.test(rule.selector) &&
        /border\s*:\s*1px solid/.test(rule.decls),
    )
    expect(card, 'the conversation top bar lost its card recipe').toBeDefined()
    expect(blurOf(card!.decls), 'the top bar floats over the transcript — it keeps its blur')
      .toBe('blur(var(--dsh-glass-blur, 14px))')
    expect(
      rules.some(
        (rule) =>
          /\[data-dsh-glass-frame\]\[data-sidebar-collapsed\][^,]*\[data-phase\][^,]*header/.test(
            rule.selector,
          ) && /margin-left\s*:\s*28px/.test(rule.decls),
      ),
      'the collapsed rail must still step the top bar right — and only the top bar',
    ).toBe(true)
  })

  // 2026-10-16: the reporter's new-session (hero) view showed an EMPTY glass
  // frame at the top of the conversation column. Upstream renders that top bar
  // as a blank layout box (`…_headerBlank` + `…_headerSessionless`: no border,
  // no min-height, no padding-top) and paints nothing — our card recipe turned
  // it into a 50px rimmed slab (live page, 0.2.0-rc.2 + mica: y 12, h 50,
  // `color(srgb .094 .094 .145 / .208)`, 1px rim, blur(5px)). Every rule in the
  // family must therefore read that same blank signal; the suffix is
  // CSS-module-stable and exists on both supported lines (0.1.7-rc.2 and
  // 0.2.0-rc.2 both emit `headerBlank`).
  const BLANK_GUARD = ":not([class*='headerBlank'])"

  it('keeps the whole top-bar family off BLANK headers (issue: empty hero frame)', () => {
    const family = gated.filter((rule) =>
      rule.selector
        .split(',')
        .map((part) => part.trim())
        .some((part) => /\[data-phase\][^,]*\bheader(?![\w-])/.test(part)),
    )
    expect(
      family.length,
      'the top-bar family shrank below 3 rules — re-check this guard against the sheet',
    ).toBeGreaterThanOrEqual(3)
    const unguarded = family.filter((rule) => !rule.selector.includes(BLANK_GUARD))
    expect(
      unguarded.map((rule) => rule.selector),
      'a top-bar rule ignores the blank signal — the hero header would grow an empty card again',
    ).toEqual([])
  })

  it('guards the card recipe, its ::after decoration and the rail step (acceptance shape)', () => {
    for (const needle of [
      "[data-dsh-glass-float] [data-phase] header:not([class*='headerBlank'])",
      "[data-dsh-glass-float] [data-phase] header:not([class*='headerBlank'])::after",
      "[data-dsh-glass-float] [data-dsh-glass-frame][data-sidebar-collapsed] [data-phase] header:not([class*='headerBlank'])",
    ]) {
      expect(
        rules.find((rule) => rule.selector === needle),
        `missing guarded rule: ${needle}`,
      ).toBeDefined()
    }
    // And the blank header must come out of the sheet with the STOCK box: no
    // margin, no padding, no fill, no rim, no blur. Anything the family declares
    // for it would defeat the guard, so the guard has to be the last word.
    for (const rule of rules) {
      const parts = rule.selector.split(',').map((part) => part.trim())
      const unguardedPart = parts.find(
        (part) => /\[data-phase\][^,]*\bheader(?![\w-])/.test(part) && !part.includes('headerBlank'),
      )
      expect(unguardedPart, `unguarded top-bar selector part: ${rule.selector}`).toBeUndefined()
    }
  })

  it('compat never paints the top bar — the empty frame is a mica-only shape (D4)', () => {
    const offenders = rules.filter(
      (rule) =>
        rule.selector.includes('data-dsh-glass-compat') && /(?:^|[\s,])header(?![\w-])/.test(rule.selector),
    )
    expect(
      offenders.map((rule) => rule.selector),
      'compat keeps the stock layout — it must not grow a top-bar card either',
    ).toEqual([])
  })
})

describe("third-party surfaces: dsh-better-display's reasoning card (2026-10-16)", () => {
  // The 「思考」 panel belongs to the third-party `dsh-better-display` bundle
  // (`ReasoningCard`, hooks `data-reader-reasoning-card` / `-heading` /
  // `-scroll` / `-text`). Its stock material is the only OPAQUE plate in the
  // transcript — `background: var(--dsw-alias-bg-module-platform)` (Mocha
  // #313244, measured rgb(49,50,68) on the live page) + a white-12% hairline
  // (`--dsw-alias-border-l2`) + a 12px radius — while every surface our skin
  // owns is translucent glass with the themed rim. The seat therefore changes
  // ALPHA / RIM / RADIUS only and keeps the hue on the plugin's own token
  // (rule 4). These assertions are what a future edit must not undo:
  const seat = rules.filter((rule) => rule.selector.includes('data-reader-reasoning-card'))
  /** The plugin's own "short and collapsed → inline text, no plate" state. */
  const NO_CARD_STATE = ":not([data-overflow='false'][data-expanded='false'])"

  it('seats both modes on the plugin s own fill token — alpha only, never a hue swap', () => {
    const hits = seat.filter((rule) => /color-mix/.test(rule.decls))
    expect(hits.length, 'the reasoning card lost its glass seat').toBeGreaterThan(0)
    for (const rule of hits) {
      expect(rule.selector, 'mica must follow the layout switch').toContain('[data-dsh-glass-float]')
      expect(rule.selector, 'compat gets the same material (D4)').toContain('[data-dsh-glass-compat]')
      expect(
        rule.decls,
        'hue must come from the plugin own token (rule 4: the glass layer does not repaint colours)',
      ).toContain('var(--dsw-alias-bg-module-platform)')
      expect(rule.decls, 'alpha must follow the frost knob').toContain('var(--dsh-glass-frost')
      expect(rule.decls).toMatch(/border-color\s*:\s*var\(--dsh-glass-rim-soft\)/)
      expect(rule.decls, 'corner language: 14px surfaces').toMatch(/border-radius\s*:\s*14px/)
    }
  })

  it('never blurs it — its backdrop is the page ground (issue #13 budget)', () => {
    const blurred = seat.filter((rule) => blurOf(rule.decls) !== undefined)
    expect(
      blurred.map((rule) => rule.selector),
      'one card per reasoning step over the low-frequency ground: a blur is an identity read that still composites',
    ).toEqual([])
  })

  it('never repaints the plugin own no-card state', () => {
    // `data-overflow=false data-expanded=false` = the plugin degrades a short,
    // collapsed reasoning into inline text (its own sheet drops the fill, the
    // border and the radius there). Our seat has higher specificity, so without
    // the guard it would glue a plate back onto inline text.
    expect(seat.length).toBeGreaterThan(0)
    const unguarded = seat.filter((rule) => !rule.selector.includes(NO_CARD_STATE))
    expect(
      unguarded.map((rule) => rule.selector),
      'the seat must carry the no-card-state guard',
    ).toEqual([])
  })
})

describe('official artifact rows: the deliverables block (2026-10-16)', () => {
  // 「已编辑 N 个文件」+ the presented-file cards come from the OFFICIAL
  // `@deepseek-ai/dsh-client-ui-deliverables` bundle (0.2.0-rc.2). Its stock
  // material is an opaque three-step stack — card body
  // `--dsw-alias-bg-layer-1` (Mocha #181825), header / file-card fills
  // `--dsw-static-neutral-850` (Mocha #1e1e2e, Latte #e6e9ef), rows painting
  // nothing — while the mica sidebar is ONE 52% `--dsh-glass-card` sheet.
  // The seat re-anchors the plugin's OWN fill variables onto that exact sheet
  // (rule 4: alpha / rim / radius only, no invented hue) and flattens the inner
  // layers so header + body + rows read as one sheet. These assertions are what
  // a future edit must not undo.
  const cardFamily = (rule: { selector: string }): boolean => /data-changed-files|data-presented-file/.test(rule.selector)
  const seat = rules.filter(cardFamily)

  it('seats the changed-files and presented-file cards on the sidebar s own sheet', () => {
    expect(seat.length, 'the deliverables block lost its glass seat').toBeGreaterThan(0)
    // The seat itself (the rule that writes the fill variables) must name BOTH
    // card kinds: a tile-only rule carrying the attribute is not a seat.
    const anchors = seat.filter((rule) => /--(changes|deliverable)-fill/.test(rule.decls))
    expect(anchors.length, 'the fill variables must be re-anchored').toBeGreaterThan(0)
    const seated = anchors.map((rule) => rule.selector).join(' | ')
    for (const needle of ['data-changed-files', 'data-presented-file']) {
      expect(seated, `${needle} is no longer seated on the glass sheet`).toContain(needle)
    }
    for (const rule of anchors) {
      expect(rule.selector, 'mica only — compat keeps the stock sidebar').toContain('[data-dsh-glass-float]')
      expect(
        rule.selector,
        'compat would thin the transcript while leaving the sidebar stock — the opposite of the request',
      ).not.toContain('[data-dsh-glass-compat]')
      // The upstream dark-scheme override `body[data-ds-dark-theme] .…_card` is
      // (0,2,1); a bare `[attr] [attr]` seat is (0,2,0) and silently loses the
      // fill on the DARK flavours only. The `<html>` step is load-bearing — and
      // it MUST be `<html>`, never `<body>`: `GlassLayer.applySettings()` writes
      // the mode attributes with `document.documentElement.toggleAttribute(...)`,
      // so `body[data-dsh-glass-float]` can never match (0.6.3-beta.1 shipped
      // that anchor and the seat was dead on the real app; the fixture that
      // "verified" it parked the attribute on <body>).
      expect(
        rule.selector,
        'the seat must out-specify the plugin own dark-scheme override — anchored on <html>, where the mode attribute actually lives',
      ).toContain('html[data-dsh-glass-float]')
      expect(rule.decls, 'the fill must be the sidebar card token').toContain('var(--dsh-glass-card)')
      expect(
        rule.decls,
        'the stock neutral step must be gone (rule 4 keeps the hue on our own sheet)',
      ).not.toContain('--dsw-static-neutral-850')
    }
    for (const rule of anchors.filter((rule) => /border-color/.test(rule.decls))) {
      expect(rule.decls).toMatch(/border-color\s*:\s*var\(--dsh-glass-rim-soft\)/)
      expect(rule.decls, 'corner language: 14px surfaces').toMatch(/border-radius\s*:\s*14px/)
    }
  })

  it('flattens the inner opaque layers — header, rows and body are ONE sheet', () => {
    const faces = rules.filter(
      (rule) => /\[data-changed-files\]\s*$/.test(rule.selector) && /background\s*:\s*var\(--dsh-glass-card\)/.test(rule.decls),
    )
    expect(
      faces.length,
      'the card body must reach the sidebar token itself (otherwise the header sits on the darker stock layer)',
    ).toBe(1)
    const clears = rules.filter(
      (rule) => /data-changed-files/.test(rule.selector) && /background\s*:\s*transparent/.test(rule.decls),
    )
    expect(clears.length, 'the header / rows / list must stop painting their own layers').toBeGreaterThan(0)
    // Each layer needs its OWN entry in the selector list of a clearing rule —
    // a union check would pass while the header silently kept its opaque plate,
    // because the list and the row entries alone already name the needles. The
    // header entry must be the DIRECT-child form: the tile rule
    // (`> :first-child > :first-child`) also contains `:first-child` plus the
    // list selector, so it must not be able to stand in for it.
    const clearsBoth = clears.filter(
      (rule) =>
        /data-changed-files\]\s*>\s*:first-child(?!\s*>)/.test(rule.selector) &&
        /ul\s*>\s*li\s*>\s*:first-child/.test(rule.selector) &&
        /data-changed-files\]\s+ul/.test(rule.selector),
    )
    expect(
      clearsBoth.length,
      'the header, the file rows and the list must each be cleared to transparent in one rule',
    ).toBeGreaterThan(0)
    const dividers = rules.filter(
      (rule) => /data-changed-files\]\s+ul/.test(rule.selector) && /border-top/.test(rule.decls),
    )
    expect(dividers.length, 'the stock white-12% divider must become the themed hairline').toBeGreaterThan(0)
    for (const rule of dividers) {
      expect(rule.decls).toMatch(/border-top\s*:\s*0?\.5px\s+solid\s+var\(--dsh-glass-rim-soft\)/)
    }
    // The presented-file cards paint `background: var(--deliverable-fill)`
    // THEMSELVES, so re-anchoring the variable alone leaves the stock opaque
    // fill in place (an element's own declaration is not toppled by the
    // ancestor it reads the variable from). The fill must be written on the
    // element — caught on the live cascade, not by reading the CSS.
    const presentedFaces = rules.filter(
      (rule) =>
        /\[data-presented-file\]\s*$/.test(rule.selector) &&
        /background\s*:\s*var\(--dsh-glass-card\)/.test(rule.decls),
    )
    expect(
      presentedFaces.length,
      'the presented-file fill must be written on the element, not only on the variable',
    ).toBe(1)
  })

  it('keeps the tone tiles a step above the sheet (both card kinds)', () => {
    const tiles = seat.filter((rule) => /background\s*:\s*var\(--dsh-glass-card-raised\)/.test(rule.decls))
    expect(tiles.length, 'the 5% white tiles would read as holes on a translucent sheet').toBeGreaterThan(0)
    const sel = tiles.map((rule) => rule.selector).join(' | ')
    expect(sel).toMatch(/data-changed-files\]\s*>\s*:first-child\s*>\s*:first-child/)
    expect(sel).toMatch(/data-presented-file\]\s*>\s*:first-child/)
  })

  it('never blurs them — the transcript flow sits on the page ground (issue #13 budget)', () => {
    const blurred = seat.filter((rule) => blurOf(rule.decls) !== undefined)
    expect(
      blurred.map((rule) => rule.selector),
      'one card per changed-file set plus one per presented file: a blur is an identity read that still composites',
    ).toEqual([])
  })
})

describe('center column: the desktop shell s last opaque pane (2026-10-16)', () => {
  // The reporter's "还是有色差" screenshot, in the official Windows shell: the
  // sidebar side read rgb(19..21, 20..21, 31..33) while the transcript read a
  // flat rgb(17,17,27). Upstream `AppFrame.module.css` paints that column with
  // `--dsw-alias-bg-base` on the desktop shells only (`[data-windows-titlebar]
  // .…_centerCol` — plus the 16px content corner — and `[data-platform=darwin]
  // .…_centerCol`); the web shell's center column has no background, which is
  // why neither the local harness nor the CI boot check ever showed the pane.
  // With the frame, the sidebar column and the conversation root already
  // transparent, this column was the only surface left that could not transmit
  // the #26 wash. Releasing the fill is verified on the live layout in
  // `.debug/ui-adapt/pane-diff.mjs` (both panes rgb(21,21,32) at the top).
  const seat = rules.filter((rule) => rule.selector.includes("class*='centerCol'"))

  it('releases the fill on the frame s own center column, float only', () => {
    const hit = seat.find((rule) =>
      /background\s*:\s*transparent/.test(rule.decls),
    )
    expect(
      hit?.selector,
      'the desktop center column must not paint --dsw-alias-bg-base, or the transcript stays a flat crust plate',
    ).toBeDefined()
    expect(hit!.selector).toContain('[data-dsh-glass-float]')
    // Scoped to the frame's own child: a bare `[class*=centerCol]` could match
    // another package's column, and this rule must never reach the official
    // compat layout.
    expect(hit!.selector).toContain('[data-dsh-glass-frame]')
    expect(hit!.selector).toContain('>')
    expect(hit!.selector).not.toContain('[data-dsh-glass-compat]')
    expect(seat.filter((rule) => rule.selector.includes('compat'))).toEqual([])
  })

  it('never invents a fill colour or a blur there — the ground does the painting', () => {
    expect(
      seat.some((rule) => /background\s*:(?!\s*transparent)/.test(rule.decls)),
      'the point is to RELEASE the pane, not to re-tint it',
    ).toBe(false)
    expect(
      seat.some((rule) => blurOf(rule.decls) !== undefined),
      'the pane sits on the page ground (issue #13 budget)',
    ).toBe(false)
    // Geometry stays upstream's: the Windows content corner is declared there,
    // and re-stating a radius here would silently reshape the title bar area.
    expect(seat.some((rule) => /border-radius/.test(rule.decls))).toBe(false)
  })

  it('leaves the other three column releases in place (the fix is additive)', () => {
    const released = (needle: string): boolean =>
      rules.some(
        (rule) =>
          rule.selector.includes(needle) && /background\s*:\s*transparent/.test(rule.decls),
      )
    expect(released('[data-dsh-glass] [data-dsh-glass-frame]')).toBe(true)
    expect(released('[data-dsh-glass] [data-phase]')).toBe(true)
    expect(released('[data-dsh-glass-details]')).toBe(true)
  })
})

describe('native caption rides the mica sheet (option C, 2026-10-16)', () => {
  // The official desktop shell colours the Windows title bar from
  // `--dsw-specific-sidebar-fill`: `syncWindowsAppearance()` in the shell's
  // `lib/preload-app.cjs` appends a hidden span to <body> whose
  // `background-color` is that token and reads it through getComputedStyle plus
  // a 1x1 canvas into `rgba()` -> `setTitleBarOverlay`. In mica mode the
  // sidebar no longer IS that colour (the column's fill is released and the
  // 52%-frost sheet draws instead), so the caption kept reading mantle while
  // the card below read the sheet over the ground: a 3-4/255 band on the
  // top-left seam. The override re-points the token at the card's own colour —
  // no new hue, and only while float/mica is on.
  const caption = rules.filter(
    (rule) => rule.decls.includes('--dsw-specific-sidebar-fill') && !rule.selector.includes('sidebarCol'),
  )

  it('is built from the card s own ingredients, over the wash s top stop', () => {
    const hit = caption.find((rule) => rule.selector.includes('[data-dsh-glass-float]'))
    expect(
      hit?.selector,
      'the desktop caption is back on the stock sidebar fill — the top-left seam returns',
    ).toBeDefined()
    expect(hit!.selector, 'the probe is a <body> child: the token must be overridden there').toContain('body')
    // The mode attribute lives on <html>, so only the ancestor form matches;
    // the `body[data-dsh-glass-…]` form was silently dead once (P0 entry).
    expect(hit!.selector).not.toMatch(/\bbody\[data-dsh-glass/)
    const decls = hit!.decls.replace(/\s+/g, ' ')
    expect(decls).toContain('--dsw-alias-bg-layer-1') // the sheet's own fill token
    expect(decls).toContain('var(--dsh-glass-frost') // ... at the frost knob's alpha
    expect(decls).toContain('--dsh-glass-wash-tint') // the wash's 0% stop = the
    expect(decls).toContain('--dsh-glass-wash-mix') //   ground right under the
    expect(decls).toContain('--dsh-glass-ambience') //   caption (brightness-aware)
    // The theme writes the whole palette INLINE on <body>, and only an
    // important author declaration outranks an inline one.
    expect(decls).toContain('!important')
    // NOT `var(--dsh-glass-card)`: that token carries alpha, and mixing a
    // translucent colour 50/50 is not compositing it over the ground.
    expect(decls, 'the caption must be an opaque composite, not a blend of a translucent fill').not.toContain(
      '--dsh-glass-card',
    )
  })

  it('never invents a colour and never leaves the alpha open', () => {
    for (const rule of caption) {
      expect(rule.decls, 'caption colour must stay token-derived (rules 1/4)').not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(rule.decls, 'a translucent caption would reach setTitleBarOverlay as rgba(...,<1)').not.toContain(
        'transparent',
      )
    }
  })

  it('is float-only: compat keeps the official sidebar fill', () => {
    expect(caption.length).toBeGreaterThan(0)
    expect(caption.every((rule) => rule.selector.includes('[data-dsh-glass-float]'))).toBe(true)
    expect(caption.some((rule) => rule.selector.includes('compat'))).toBe(false)
  })
})

describe('official transcript surface: the turn-trigger notice (2026-10-16)', () => {
  // 「继续执行目标」 — upstream `TurnTriggerNodeView` in
  // `@deepseek-ai/dsh-client-ui-chat` (0.2.0-rc.2, the bundle inside the desktop
  // shell's app.asar). The section carries upstream's own `data-turn-trigger`
  // hook, and its stock material is a NEUTRAL plate: the official table defines
  // `--dsw-alias-turn-trigger-bg` as `--dsw-alias-interactive-bg-hover` on the
  // dark flavours, i.e. `rgba(255,255,255,.08)` / `.14` hovered, over a `.5px`
  // `border-l1` hairline at the 20px `--dsw-radius-xl`. Measured on the Mocha
  // ground (#11111b): #24242d at rest, #32323b hovered — the reporter's
  // screenshot reads exactly #32323b.
  const seat = rules.filter((rule) => rule.selector.includes('[data-turn-trigger]'))

  it('seats the notice on the sidebar sheet — mica only, at the card radius', () => {
    expect(seat.length, 'the turn-trigger notice lost its glass seat').toBeGreaterThan(0)
    const fill = seat.filter((rule) =>
      /background\s*:\s*var\(--dsh-glass-card\)/.test(rule.decls),
    )
    expect(
      fill.length,
      'the notice must take our own sheet token, not a hand-picked colour',
    ).toBeGreaterThan(0)
    for (const rule of fill) {
      expect(rule.selector, 'the fill rule must carry the mica gate').toContain(
        'html[data-dsh-glass-float]',
      )
      expect(
        rule.selector,
        'compat deliberately keeps the official transcript material',
      ).not.toContain('data-dsh-glass-compat')
    }
    expect(
      seat.some((rule) => /border-color\s*:\s*var\(--dsh-glass-rim-soft\)/.test(rule.decls)),
      'the stock 6% neutral hairline must become the themed rim',
    ).toBe(true)
    expect(
      seat.some((rule) => /border-radius\s*:\s*14px/.test(rule.decls)),
      'corner language: 14px surfaces',
    ).toBe(true)
  })

  it('never blurs it and never invents a hue', () => {
    for (const rule of seat) {
      expect(
        blurOf(rule.decls),
        'a block in the transcript flow sits over the page ground (issue #13 budget)',
      ).toBeUndefined()
      expect(
        rule.decls,
        'no literal colour: the frost knob must keep driving the card',
      ).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
  })

  it('keeps the hover step on our own raised token', () => {
    const hover = seat.filter((rule) => rule.selector.includes(':hover'))
    expect(
      hover.length,
      "our (0,2,1) seat out-specifies upstream's .oE-XyW_root:hover (0,2,0) — it must be re-stated or the hover step freezes",
    ).toBeGreaterThan(0)
    expect(hover.some((rule) => /var\(--dsh-glass-card-hover\)/.test(rule.decls))).toBe(true)
  })

  it('never anchors the mode attributes on <body> — they live on <html>', () => {
    // GlassLayer.applySettings() writes data-dsh-glass / -float / -compat with
    // `document.documentElement.toggleAttribute(...)` (and data-ds-dark-theme is
    // the only one that lives on <body>). A `body[data-dsh-glass-*]` step can
    // therefore NEVER match: 0.6.3-beta.1 shipped the deliverables seat that way
    // and it was dead on the real app, while the acceptance fixture (attribute
    // parked on <body>, `.debug/ui-adapt/artifacts-page.mjs`) stayed green.
    // Real-Chromium proof of both placements: `.debug/ui-adapt/notice-lab.mjs`,
    // variants 3 (html, seat applies) vs 4 (html, `body[…]` seat, no effect).
    // Comments are stripped first: the sheet's own prose cites the dead anchor.
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/body\[data-dsh-glass-(float|compat)\]/)
    expect(
      rules.filter((rule) => /body\[data-dsh-glass-(float|compat)\]/.test(rule.selector)),
      'the mode attributes live on <html>, so a body-anchored rule is dead CSS',
    ).toEqual([])
  })
})

describe('stylesheet integrity (2026-10-16)', () => {
  // The sheet ships as TEXT (`glass-css.gen.ts`) and is mounted as a <style>
  // tag, so the BROWSER is the first parser that sees it — and a syntax error
  // there is not local: the CSS parser recovers by dropping everything from the
  // error point on. That happened once, on 2026-10-16: a new rule's block
  // comment contained a nested `/* … */` marker, the comment ended early, and
  // the top-bar family silently disappeared at runtime — while the build, the
  // type checker and every existing glass test stayed green.
  it('parses cleanly with the same parser the build uses', async () => {
    const { transform } = await import('lightningcss')
    expect(() =>
      transform({ filename: 'glass.module.css', code: Buffer.from(CSS), minify: true }),
    ).not.toThrow()
  })

  it('never nests a comment marker inside a comment', () => {
    const offenders: number[] = []
    let i = 0
    while ((i = CSS.indexOf('/*', i)) !== -1) {
      const end = CSS.indexOf('*/', i + 2)
      if (end === -1) {
        offenders.push(CSS.slice(0, i).split('\n').length)
        break
      }
      if (CSS.slice(i + 2, end).includes('/*')) offenders.push(CSS.slice(0, i).split('\n').length)
      i = end + 2
    }
    expect(
      offenders,
      'a nested /* inside a block comment ends it early — every rule after it is dropped at runtime',
    ).toEqual([])
  })
})
describe('composer dock backing: the stats row gets the ground back (issue #28)', () => {
  // The seat rule above this block drops stock's whole backing on purpose
  // (`linear-gradient(0 → --dsw-alias-bg-base 36px)`): an opaque slab behind
  // the CARD would kill its frost, which is the reason the skin exists. But the
  // dock row (model / stats / context meter) renders BELOW the card inside the
  // same sticky-or-absolute seat at z-index 7, so with no paint at all the
  // scrolling transcript read straight through it — the reporter's issue #28.
  // The band therefore has to cover the dock strip and nothing of the card.
  it('keeps the seat itself paint-free (no slab behind the card)', () => {
    const seat = rules.filter((rule) => rule.selector.includes("[class*='composerSeat']"))
    expect(seat.length, 'the composer seat rule vanished').toBeGreaterThan(0)
    for (const rule of seat) {
      expect(blurOf(rule.decls), 'issue #19: the seat hosts the trigger palette').toBeUndefined()
      const background = /(?:^|;)\s*background\s*:\s*([^;]+)/.exec(rule.decls)?.[1]?.trim()
      if (background !== undefined) {
        expect(background, rule.selector + ' must stay unpainted').toBe('none')
      }
    }
  })

  it('paints the page ground on the dock strip, behind its content and full-bleed', () => {
    const band = rules.find(
      (rule) =>
        rule.selector.includes("[class*='dock']::before") ||
        rule.selector.includes('[data-composer-dock]::before'),
    )
    expect(band, 'issue #28: the dock lost its backing and nothing replaced it').toBeDefined()
    expect(band!.selector).toContain('[data-dsh-glass-inputbar]')
    expect(band!.selector, 'the band must not ride the card').not.toContain('[data-composer-card]')
    expect(band!.decls).toMatch(/position\s*:\s*absolute/)
    expect(band!.decls, "behind the row's own content").toMatch(/z-index\s*:\s*-1/)
    expect(band!.decls).toMatch(/pointer-events\s*:\s*none/)
    expect(band!.decls, 'the fill is the page ground, not a token colour').toContain(
      'var(--dsh-glass-ground)',
    )
    expect(band!.decls, 'needs a ramp, not a hard cut across the gutters').toMatch(/linear-gradient/)
    expect(band!.decls, "bleeds past the bar root's side padding").toMatch(
      /left\s*:\s*calc\(-1 \* var\(--dsh-composer-side-clearance/,
    )
    expect(blurOf(band!.decls), 'issue #13: an opaque ground fill needs no blur').toBeUndefined()
  })
})

describe('settings ground sample (2026-10-19)', () => {
  // The glass row carries two knobs that move the PAGE ground: background
  // brightness and the glow switch. Neither had a visible target inside the
  // settings page — the panel's own fill is the bluish ladder under
  // `[data-dsh-glass-settings]`, so the ground only leaks around its edges and
  // both knobs could only be judged after closing the dialog.
  //
  // The fix is a sample strip that shares the body's ground rule through a
  // selector LIST (one declaration, two consumers). Copying the recipe instead
  // would duplicate the issue #25 trap (the ambience weights must stay inline in
  // `background`), and the two copies would drift apart silently. These
  // assertions pin the sharing, so a future "cleanup" that splits the rule into
  // two declarations fails here.
  const groundRule = rules.find(
    (rule) =>
      selectorList(rule.selector).includes('[data-dsh-glass] body') &&
      /(?:^|;)\s*background\s*:/.test(rule.decls),
  )

  it('paints the sample from the body ground rule itself, not a copy', () => {
    expect(groundRule, 'the ground background rule disappeared').toBeDefined()
    expect(
      selectorList(groundRule!.selector),
      'the strip must ride the SAME declaration as the page — splitting it lets the two drift',
    ).toContain('[data-dsh-glass] [data-dsh-glass-ground-sample]')
    expect(
      rules.filter(
        (rule) =>
          selectorList(rule.selector).includes('[data-dsh-glass] [data-dsh-glass-ground-sample]') &&
          /(?:^|;)\s*background\s*:/.test(rule.decls),
      ),
      'the strip must not get a second background declaration',
    ).toHaveLength(1)
  })

  it('keeps the strip blur-free: it IS the ground', () => {
    const sample = rules.filter((rule) => rule.selector.includes('ground-sample'))
    expect(sample.length, 'the strip lost its CSS hook').toBeGreaterThan(0)
    for (const rule of sample) {
      expect(blurOf(rule.decls), `${rule.selector} must not blur the ground it is made of`).toBeUndefined()
    }
  })
})
