#!/usr/bin/env node
/**
 * Generate src/client/palettes.ts — the Catppuccin token tables for the
 * DeepSeek Harness web GUI.
 *
 * Inputs:
 *   - ../../.cache/dsh-ref/dsw-tokens.json          (parsed official design-platform.css)
 *   - ../../.cache/dsh-ref/catppuccin-palette.json  (official Catppuccin palette v1.8.0)
 *
 * Strategy: every --dsw-static-*, --dsw-alias-*, --dsw-specific-* token the
 * official theme stylesheet declares is remapped to a Catppuccin colour for
 * each of the four flavours (Latte / Frappé / Macchiato / Mocha).
 *
 * The official static ladder runs 00 (white) -> 1000 (near-black) and the
 * alias layer flips which end it reads on light vs dark (light: bg-base =
 * bluish-00; dark: bg-base = bluish-950). Each Catppuccin flavour therefore
 * maps the ladder onto its own ramp (Latte: base -> text; dark flavours:
 * text -> crust), and the alias/specific entries keep their var() references
 * so our static overrides flow through automatically. Literal (non-var)
 * alias entries are kept except the brand-primary pin, which is remapped to
 * the Catppuccin brand blue.
 *
 * Re-run after editing the mapping tables below: `node scripts/generate-palettes.mjs`
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REF = join(__dirname, '..', '..', '.cache', 'dsh-ref')
const OUT = join(__dirname, '..', 'src', 'client', 'palettes.ts')

// Item L: `--pin <sha>` embeds the upstream palette commit SHA into the
// generated header (// UPSTREAM_PIN), so a silently-swapped cache file or a
// hand-pinned refresh becomes auditable. No pin → the header stays the
// generic note (existing behavior).
const pinArg = process.argv.indexOf('--pin')
const UPSTREAM_PIN = pinArg >= 0 && process.argv[pinArg + 1] !== undefined
  ? String(process.argv[pinArg + 1]).trim()
  : null
if (pinArg >= 0 && UPSTREAM_PIN === null) {
  console.error('generate-palettes: --pin requires a SHA argument, e.g. --pin 1a2b3c4d')
  process.exit(1)
}

const official = JSON.parse(readFileSync(join(REF, 'dsw-tokens.json'), 'utf8'))
const catppuccin = JSON.parse(readFileSync(join(REF, 'catppuccin-palette.json'), 'utf8'))

/** Resolve one Catppuccin colour to hex for a flavour. */
function ctp(flavor, name) {
  const col = catppuccin[flavor]?.colors?.[name]
  if (!col) throw new Error(`catppuccin colour "${name}" not found in ${flavor}`)
  return col.hex
}

/** CSS color-mix helper for derived shades that keep the palette canonical. */
function mix(flavor, name, pct, againstName) {
  const a = ctp(flavor, name)
  const b = ctp(flavor, againstName)
  return `color-mix(in srgb, ${a} ${pct}%, ${b})`
}

/* ------------------------------------------------------------------ *
 * Mapping tables: official token family -> Catppuccin colour plan     *
 * ------------------------------------------------------------------ */

/**
 * Neutral (bluish) grayscale ladder, 00 (lightest) -> 1000 (darkest).
 * Mapped onto the Catppuccin ramp per scheme family. Latte reads the ladder
 * light-end-first (00 -> base, 1000 -> text); dark flavours read it
 * dark-end-first for surfaces (bg-base = bluish-950 must be the deepest
 * surface, crust) while the top of the ladder stays the text ramp.
 */
const bluishLightPlan = {
  '00': 'base', '50': 'mantle', '60': 'mantle',
  '75': 'surface0', '100': 'surface1', '150': 'surface2',
  '200': 'overlay0', '250': 'overlay0', '300': 'overlay1',
  '400': 'overlay2', '500': 'subtext0', '550': 'subtext0',
  '600': 'subtext1', '700': 'subtext1',
  '750': 'text', '800': 'text', '850': 'text',
  '875': 'text', '900': 'text', '950': 'text', '1000': 'text',
}
const bluishDarkPlan = {
  '00': 'text', '50': 'text', '60': 'subtext1',
  '75': 'subtext1', '100': 'subtext0', '150': 'subtext0',
  '200': 'overlay2', '250': 'overlay2', '300': 'overlay1',
  '400': 'overlay0', '500': 'surface2', '550': 'surface1',
  '600': 'surface1', '700': 'surface0', '750': 'surface0',
  '800': 'surface0', '850': 'base',
  '875': 'mantle', '900': 'mantle', '950': 'crust', '1000': 'crust',
}

/** Brand blue ladder (--dsw-static-deepseek-* / --dsw-static-blue-*).
 *  500 = the brand blue itself; lighter steps are mixed toward the scheme's
 *  base surface, darker steps toward the deepest surface (`crust`, named per
 *  step in the dark plan — see issue #11). */
const blueLightPlan = {
  '50': ['blue', 8], '50p': ['blue', 12], '75': ['blue', 16], '100': ['blue', 22],
  '200': ['blue', 34], '300': ['blue', 48], '400': ['blue', 65],
  '450': ['blue', 82], '500': ['blue', 100], '600': ['blue', 82],
  '700-delete': ['blue', 66], '800': ['blue', 50], '900': ['blue', 38],
  '950': ['blue', 26],
}
const blueDarkPlan = {
  '50': ['blue', 10], '50p': ['blue', 14], '75': ['blue', 18], '100': ['blue', 24],
  '200': ['blue', 36], '300': ['blue', 50], '400': ['blue', 66],
  '450': ['blue', 84], '500': ['blue', 100], '600': ['blue', 84],
  '700-delete': ['blue', 68],
  // The dark end is a *surface* tint, not a dim accent: alias tokens such as
  // state-business-tertiary paint it under a blue label (issue #11), so it has
  // to stay near the deepest surface instead of drifting into mid-tone.
  '800': ['blue', 18, 'crust'], '900': ['blue', 14, 'crust'],
  '950': ['blue', 10, 'crust'],
}

/** One blue-ladder step (`[colour, pct, surface?]`, 100% = the accent itself). */
function blueStep(flavor, plan, step) {
  const [col, pct, surface] = plan[step] ?? ['blue', 100]
  return pct === 100 ? ctp(flavor, col) : mix(flavor, col, pct, surface ?? 'base')
}

/** Semantic status families. */
const greenPlan = { '100': ['green', 18], '400': ['green', 80], '500': ['green', 100], '900': ['green', 30] }
const redPlan = { '50': ['red', 10], '100': ['red', 20], '400': ['red', 70], '500': ['red', 100], '600': ['red', 100], '900': ['red', 34] }
const amberPlan = { '100': ['peach', 20], '400': ['peach', 70], '500': ['peach', 100], '600': ['peach', 100], '900': ['peach', 32] }

/**
 * Dark-only override for the status families' 900 step. `state-success-tertiary`
 * and `state-warn-tertiary` are *tinted surfaces* that a bright label sits on
 * (the official `contextGreen` / `warn-label` chips), so in dark flavours the
 * 900 step has to hug the deepest surface instead of drifting into mid-tone —
 * the same failure the blue ladder had before issue #11 (measured 3.18–4.37:1
 * against the label with the generic `base` mix). Light flavours keep the
 * generic mix: there the 900 step is a pale chip under a dark label instead.
 * `red-900` has no alias consumer, so it is deliberately left alone.
 *
 * Sweep (label-on-tint contrast, 10→30% toward crust): 14% overshoots upstream
 * (6.3–9.3 vs the official 5.25/5.53) and washes the hue out; 22% drops Frappé
 * amber to 4.54 — too thin a floor. 18% lands 4.96–8.30, i.e. upstream's ratio
 * band with visible chroma, and matches the blue ladder's own 800 step.
 */
const darkStatusTint = { 'green-900': ['green', 18, 'crust'], 'amber-900': ['peach', 18, 'crust'] }

/* ------------------------------------------------------------------ *
 * static layer                                                        *
 * ------------------------------------------------------------------ */

function staticTokens(flavor) {
  const dark = catppuccin[flavor].dark
  const bluishPlan = dark ? bluishDarkPlan : bluishLightPlan
  const bluePlan = dark ? blueDarkPlan : blueLightPlan
  const out = {}
  for (const [name, value] of Object.entries(official.light_static)) {
    const base = name.replace(/^dsw-static-/, '')
    let hex
    if (base.startsWith('neutral-bluish-')) {
      const step = base.slice('neutral-bluish-'.length)
      hex = ctp(flavor, bluishPlan[step] ?? 'text')
    } else if (base.startsWith('neutral-')) {
      const step = base.slice('neutral-'.length)
      hex = ctp(flavor, bluishPlan[step] ?? 'text')
    } else if (base.startsWith('deepseek-')) {
      hex = blueStep(flavor, bluePlan, base.slice('deepseek-'.length))
    } else if (base.startsWith('blue-')) {
      hex = blueStep(flavor, bluePlan, base.slice('blue-'.length))
    } else if (base.startsWith('green-')) {
      const step = base.slice('green-'.length)
      const [col, pct, surface] = (dark ? darkStatusTint[base] : undefined) ?? greenPlan[step] ?? ['green', 100]
      hex = pct === 100 ? ctp(flavor, col) : mix(flavor, col, pct, surface ?? 'base')
    } else if (base.startsWith('red-')) {
      const step = base.slice('red-'.length)
      const [col, pct, surface] = redPlan[step] ?? ['red', 100]
      hex = pct === 100 ? ctp(flavor, col) : mix(flavor, col, pct, surface ?? 'base')
    } else if (base.startsWith('amber-')) {
      const step = base.slice('amber-'.length)
      const [col, pct, surface] = (dark ? darkStatusTint[base] : undefined) ?? amberPlan[step] ?? ['peach', 100]
      hex = pct === 100 ? ctp(flavor, col) : mix(flavor, col, pct, surface ?? 'base')
    } else {
      hex = ctp(flavor, 'text')
    }
    out[name] = hex
  }
  // The brand-blue "900" step is a readable *label* colour sitting on a light
  // tinted surface (the hero "预览版" badge via --dsw-alias-label-primary-bluish).
  // The generic light plan mixes every step toward the light base surface, which
  // washes 900 out to a pale tint. Pin it to a dark blue (mixed toward the dark
  // text colour) so it stays legible on the light badge. Only this one step is
  // consumed as text, so the override is safe; the dark flavours mix toward a
  // dark base already and are left alone.
  if (!dark) out['dsw-static-blue-900'] = mix(flavor, 'blue', 30, 'text')
  return out
}

/* ------------------------------------------------------------------ *
 * alias + specific layers                                             *
 * ------------------------------------------------------------------ */

/**
 * Dark-flavour label readability overrides (issue #7).
 *
 * The official stylesheet's dark alias layer points the weak label tokens at
 * the bluish ladder's mid steps (secondary -> 300, tertiary -> 400, caption ->
 * 600, dimmed -> 750). Those steps are *light-to-mid greys* in the stock theme
 * because the stock theme never redefines the static ladder. Our dark flavours
 * map the very same steps to Catppuccin overlay/surface colours (which is what
 * makes the ladder useful for surfaces), so the aliases inherit dark text on
 * dark backgrounds — e.g. Macchiato caption (#494d64) on a menu (#363a4f)
 * measured 1.35:1, nearly invisible.
 *
 * Fix: keep the ladder untouched and point these label aliases at the light end
 * of the ramp instead, so the full hierarchy stays monotonic and readable:
 * primary (bluish-50/text) > primary-dimmed (75/subtext1) > secondary
 * (150/subtext0) > tertiary (200/overlay2) > caption (300/overlay1) > dimmed
 * (400/overlay0). Latte already reads the ladder light-end-first and is left
 * alone. See issue #7. The primary-dimmed step (75) was contributed via
 * PR #8 review.
 */
const darkLabelReadabilityOverrides = {
  // issue #11: the selected segment of a segmented pick (and the host's
  // trajectory "user" badge) paints a blue label on the blue-800 tint:
  // state-business-primary on state-business-tertiary. Official dark pairs
  // #34415b with #679efe (4.6:1); our dark ladder put 52% blue and 66% blue
  // next to each other, collapsing the pair to ~1.25:1 — invisible. With the
  // 800 step back at the deepest surface, the accent itself reads on it.
  'dsw-alias-state-business-primary': 'var(--dsw-static-deepseek-500)',
  'dsw-alias-label-primary-dimmed': 'var(--dsw-static-neutral-bluish-75)',
  'dsw-alias-label-secondary': 'var(--dsw-static-neutral-bluish-150)',
  'dsw-alias-label-tertiary': 'var(--dsw-static-neutral-bluish-200)',
  'dsw-alias-label-caption': 'var(--dsw-static-neutral-bluish-300)',
  'dsw-alias-label-dimmed': 'var(--dsw-static-neutral-bluish-400)',
}

/** Alias tokens: keep official values (var() refs resolve through our static overrides). */
function aliasTokens(flavor) {
  const dark = catppuccin[flavor].dark
  const table = dark ? official.dark_alias : official.light_alias
  const out = {}
  for (const [name, value] of Object.entries(table)) {
    // Hard-coded brand colour pin remapped to the Catppuccin brand blue;
    // everything else keeps its official value, except the dark label
    // readability overrides above.
    if (name === 'dsw-alias-brand-primary-new-colorprimary-new-color') {
      out[name] = ctp(flavor, 'blue')
    } else if (dark && darkLabelReadabilityOverrides[name]) {
      out[name] = darkLabelReadabilityOverrides[name]
    } else {
      out[name] = value
    }
  }
  return out
}

function specificTokens(flavor) {
  const dark = catppuccin[flavor].dark
  const table = dark ? official.dark_specific : official.light_specific
  const out = {}
  for (const [name, value] of Object.entries(table)) out[name] = value
  return out
}

/* ------------------------------------------------------------------ *
 * emit                                                                *
 * ------------------------------------------------------------------ */

const FLAVORS = [
  { id: 'latte', label: 'Latte' },
  { id: 'frappe', label: 'Frappé' },
  { id: 'macchiato', label: 'Macchiato' },
  { id: 'mocha', label: 'Mocha' },
]

const lines = []
lines.push(`/**
 * AUTO-GENERATED by scripts/generate-palettes.mjs — do not edit by hand.
 * Catppuccin token tables for the DeepSeek Harness web GUI.
 * Source palette: https://github.com/catppuccin/catppuccin (palette.json v1.8.0).
${UPSTREAM_PIN !== null ? ` * // UPSTREAM_PIN: ${UPSTREAM_PIN}
` : ''} * Each flavour carries a flat dictionary of every --dsw-static-*,
 * --dsw-alias-* and --dsw-specific-* token the official theme stylesheet
 * declares. Alias/specific entries keep their var() references so the static
 * overrides below flow through automatically; literal (non-var) entries are
 * remapped to Catppuccin colours.
 */`)

lines.push(`export type CatppuccinFlavorId = 'latte' | 'frappe' | 'macchiato' | 'mocha'`)

lines.push(`export interface CatppuccinFlavorInfo {
  /** Theme id registered into ThemeRuntime. */
  themeId: string
  /** Base color scheme this flavour builds on. */
  colorScheme: 'light' | 'dark'
  /** Display label. */
  label: string
  /** Accent colour for the settings row swatch. */
  accent: string
  /** Token dictionary (--dsw-* names). */
  tokens: Record<string, string>
}`)

for (const f of FLAVORS) {
  const staticT = staticTokens(f.id)
  const aliasT = aliasTokens(f.id)
  const specificT = specificTokens(f.id)
  const tokens = { ...staticT, ...aliasT, ...specificT }
  const accent = ctp(f.id, 'blue')
  const colorScheme = catppuccin[f.id].dark ? 'dark' : 'light'

  lines.push(``)
  lines.push(`export const CATPPUCCIN_${f.id.toUpperCase()}: CatppuccinFlavorInfo = {`)
  lines.push(`  themeId: 'catppuccin-${f.id}',`)
  lines.push(`  colorScheme: '${colorScheme}',`)
  lines.push(`  label: '${f.label}',`)
  lines.push(`  accent: '${accent}',`)
  lines.push(`  tokens: {`)
  for (const [name, value] of Object.entries(tokens)) {
    lines.push(`    ${JSON.stringify(`--${name}`)}: ${JSON.stringify(value)},`)
  }
  lines.push(`  },`)
  lines.push(`}`)
}

lines.push(``)
lines.push(`export const CATPPUCCIN_FLAVORS: readonly CatppuccinFlavorInfo[] = [`)
for (const f of FLAVORS) lines.push(`  CATPPUCCIN_${f.id.toUpperCase()},`)
lines.push(`]`)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n')
console.log(`wrote ${OUT} (${FLAVORS.length} flavours)`)
