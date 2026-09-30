#!/usr/bin/env node
/**
 * Parse an upstream `design-platform.css` into the token snapshot that
 * `generate-palettes.mjs` consumes (`.cache/dsh-ref/dsw-tokens.json`).
 *
 * The stylesheet declares the token ladder twice per scheme, in two `body`
 * rules: the static palette first, then the alias + specific layers (the
 * second `body[data-ds-dark-theme]` block mirrors both for dark). This script
 * keeps the two roles apart so `light_static` / `dark_alias` / … can be
 * selected independently.
 *
 * 0.2.0 adds two trailing `html[data-platform='darwin'] body` blocks that
 * re-declare `--dsw-specific-menu` at 94% for macOS. They are deliberately NOT
 * parsed: the palette tables are platform-agnostic (one value per scheme), and
 * a platform branch would need a conditional layer in the injected stylesheet
 * rather than another key in this snapshot. The regex below is anchored on
 * `body`, so those blocks are skipped without touching the 2 + 2 layout check.
 *
 * Usage:
 *   node scripts/parse-dsh-tokens.cjs <design-platform.css> <out.json>
 *
 * The upstream file is reachable at
 *   https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/<tag>/packages/client/ui-theme/src/styles/design-platform.css
 * and is intentionally NOT vendored — see the header of generate-palettes.mjs.
 */
const fs = require('node:fs')

const [, , inFile, outFile] = process.argv
if (!inFile || !outFile) {
  console.error('usage: node scripts/parse-dsh-tokens.cjs <design-platform.css> <out.json>')
  process.exit(1)
}

const lines = fs.readFileSync(inFile, 'utf8').split(/\r?\n/)

// Collect the four rule blocks: `body {` (light) and
// `body[data-ds-dark-theme] {` (dark), each appearing twice.
const blocks = []
let current = null
for (const line of lines) {
  const open = line.match(/^(body(?:\[data-ds-dark-theme\])?)\s*\{/)
  if (open) {
    current = { selector: open[1], vars: {} }
    blocks.push(current)
    continue
  }
  if (current === null) continue
  if (/^\}/.test(line)) {
    current = null
    continue
  }
  const m = line.match(/^\s*(--[A-Za-z0-9-]+):\s*(.+?);\s*$/)
  if (m) current.vars[m[1].replace(/^--/, '')] = m[2]
}

const light = blocks.filter((b) => b.selector === 'body')
const dark = blocks.filter((b) => b.selector === 'body[data-ds-dark-theme]')
if (light.length !== 2 || dark.length !== 2) {
  console.error(`unexpected block layout: light=${light.length} dark=${dark.length}`)
  process.exit(1)
}

// Four buckets: the three `--dsw-` families the palette plans are keyed by, plus
// `other` for `--dsw-*` names outside them. 0.2.0 added the first such token,
// `--dsw-menu-surface-fill` (the base menu/overlay material that
// `--dsw-specific-menu` now references) — dropping it silently would leave that
// one surface token with an official *literal* value unmapped.
const split = (vars) => {
  const out = { static: {}, alias: {}, specific: {}, other: {} }
  for (const [k, v] of Object.entries(vars)) {
    if (k.startsWith('dsw-static-')) out.static[k] = v
    else if (k.startsWith('dsw-alias-')) out.alias[k] = v
    else if (k.startsWith('dsw-specific-')) out.specific[k] = v
    else if (k.startsWith('dsw-')) out.other[k] = v
    else console.error(`  (skipped non-dsw var: ${k})`)
  }
  return out
}

const L0 = split(light[0].vars)
const D0 = split(dark[0].vars)
const L1 = split(light[1].vars)
const D1 = split(dark[1].vars)

const snapshot = {
  light_static: L0.static,
  dark_static: D0.static,
  light_alias: L1.alias,
  dark_alias: D1.alias,
  light_specific: L1.specific,
  dark_specific: D1.specific,
  light_other: L1.other,
  dark_other: D1.other,
}

fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + '\n')
console.log(
  `wrote ${outFile}: static ${Object.keys(L0.static).length}/${Object.keys(D0.static).length}, ` +
    `alias ${Object.keys(L1.alias).length}/${Object.keys(D1.alias).length}, ` +
    `specific ${Object.keys(L1.specific).length}/${Object.keys(D1.specific).length}, ` +
    `other ${Object.keys(L1.other).length}/${Object.keys(D1.other).length}`,
)
