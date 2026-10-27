/**
 * Pre-paint palette: the flavour's `--dsw-*` table, injected into the index
 * HTML so the FIRST frame is already Catppuccin (issue #30 补充, 2026-10-27).
 *
 * Why this exists. The official `dsh-client-ui-theme` Host half contributes two
 * boot rows through `webserver/index-inject` (prepended): a head `<style>`
 * painting `body{background-color:#151517}` (or `#fff`) plus `color-scheme`,
 * and a body script that sets `data-ds-dark-theme` for the durable built-in
 * preference. Those decide the colour of everything BEFORE any script runs.
 * Our flavours can only be `theme.register()`ed and `setTheme()`d by the
 * Client bundle, i.e. strictly after first paint — so a Catppuccin user sees
 * the official dark (or light) canvas flash first. Measured by the reporter on
 * 0.6.4 (CPU 3x, fresh browser): first-frame centre pixel `#151517`, official
 * dark, with `flavor: catppuccin-frappe` persisted.
 *
 * The fix mirrors the official rows: paint the same document canvas with the
 * flavour's own token table, and let the Client remove the sheet the moment the
 * flavour theme actually takes over (the sheet must not outlive that point —
 * its selector outranks the official `body` block, so a leftover sheet would
 * pin every token and defeat later theme switches).
 *
 * Contract notes (all verified against the 0.2.1-rc.3 release):
 *  - Rows are plain JSON (`IndexInjection`): `{ kind: 'style', text }`,
 *    `{ kind: 'html', placement, html }`, `{ kind: 'script', placement, text }`.
 *    This module uses `html` for the sheet so it can carry an identifying
 *    attribute the Client can query — a `style` row renders without attributes.
 *  - The official rows are pushed with `{ prepend: true }`, so rows appended
 *    from here land AFTER them; both the style order and the body-script order
 *    therefore favour us. Do not rely on that alone: the sheet selector is
 *    `html body` (0,0,2), which beats the official `body` (0,0,1) block that the
 *    Client bundle injects later, no matter the order.
 *  - The served index carries no CSP header, so inline style/script is allowed
 *    (the official theme relies on exactly that).
 *  - The Host only knows the durable flavour where the config field is a
 *    volatile ref (`Config.flavor.get()` on DSH >= 0.1.7). On the legacy seam
 *    the entry config is the profile patch's static value, NOT the settings
 *    document, so injecting from it would paint the wrong palette — those hosts
 *    get no rows at all (`bootPaletteRows` returns `[]`).
 */
import { CATPPUCCIN_FLAVORS, type CatppuccinFlavorInfo } from './client/palettes.ts'

/** Attribute marking the injected `<style>` so the Client can find it. */
export const BOOT_PALETTE_ATTR = 'data-dsh-catppuccin-boot'

/** One index-injection row, structurally typed (the host package is not a
 *  dependency of this plugin, so the shape is declared here — same reasoning as
 *  `WebServerLike` in `src/update-check/host.ts`). */
export type BootPaletteRow =
  | { kind: 'style'; text: string }
  | { kind: 'script'; placement: 'head' | 'body'; text: string }
  | { kind: 'html'; placement: 'head' | 'body'; html: string }

/** The two config fields this module reads, in BOTH shapes they arrive in:
 *  a volatile ref (`{ get() }`) on DSH >= 0.1.7, a plain value on older hosts
 *  (where the value is the patch's static default, not the durable choice). */
export interface BootPaletteConfig {
  flavor?: { get(): unknown } | unknown
  overrides?: { get(): unknown } | unknown
}

/** Read a volatile config ref; `undefined` when the field is NOT a ref.
 *
 *  Returning `undefined` for plain values is the legacy-host gate described in
 *  the module header: a plain `flavor` is the profile patch's default, so
 *  painting it would fight the durable document. */
function readVolatile(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  const getter = (value as { get?: unknown }).get
  if (typeof getter !== 'function') return undefined
  try {
    return (getter as () => unknown).call(value)
  } catch {
    return undefined
  }
}

/**
 * Keep only override entries that are safe to embed in a `<style>` text node.
 *
 * `sanitizeOverrides` (the durable contract) already drops non-`--` keys and
 * non-string values, but a value is arbitrary text: `}</style><script>…` would
 * escape the element, and `;`/`{`/`}` would escape the declaration. Values are
 * CSS expressions, so everything else stays allowed (`color-mix(…)`, `var(…)`,
 * `rgba(…)`, quotes, slashes).
 * @param raw - the durable overrides map as the Host resolved it.
 * @returns the subset safe to concatenate into the sheet.
 */
export function cssSafeOverrides(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue
    if (!/^--[A-Za-z0-9_-]+$/u.test(key)) continue
    if (/[<>\\{};\u0000-\u001f]/u.test(value)) continue
    out[key] = value
  }
  return out
}

/** The declaration block for one flavour: every token, then the user overrides
 *  (last wins), then the canvas colour the boot splash reads. */
function declarationBlock(flavor: CatppuccinFlavorInfo, overrides: Record<string, string>): string {
  const tokens = Object.entries(flavor.tokens).map(([name, value]) => `${name}:${value}`)
  const extra = Object.entries(overrides).map(([name, value]) => `${name}:${value}`)
  return [...tokens, ...extra, 'background-color:var(--dsw-alias-bg-base)'].join(';')
}

/**
 * The pre-paint `<style>` element (carries {@link BOOT_PALETTE_ATTR}).
 *
 * Two selectors on purpose: `html body` outranks the official `body` block
 * (which the Client bundle installs later), and the `[data-ds-dark-theme]`
 * variant keeps the sheet in force when the official boot script toggled the
 * attribute to the opposite scheme.
 * @param flavor - the persisted flavour.
 * @param overrides - already filtered by {@link cssSafeOverrides}.
 * @returns a complete `<style>…</style>` fragment for a `kind: 'html'` row.
 */
export function bootPaletteStyle(
  flavor: CatppuccinFlavorInfo,
  overrides: Record<string, string> = {},
): string {
  // `color-scheme` follows the flavour so scrollbars, form controls and the
  // `Canvas` keyword are right from the first frame (the official row sets it
  // from the built-in preference, which can be the opposite scheme).
  return `<style ${BOOT_PALETTE_ATTR}>`
    + `:root{color-scheme:${flavor.colorScheme}}`
    + `html body,html body[data-ds-dark-theme]{${declarationBlock(flavor, overrides)}}`
    + '</style>'
}

/**
 * The body script that aligns the shell's dark-variant attribute with the
 * flavour. Runs after the official script (the official rows are prepended), so
 * it wins; it touches NOTHING else — `data-ds-theme-source` and the font
 * variables stay the official script's business.
 * @param flavor - the persisted flavour.
 * @returns the script text for a `kind: 'script'` row.
 */
export function bootPaletteScript(flavor: CatppuccinFlavorInfo): string {
  return `(()=>{document.body.toggleAttribute('data-ds-dark-theme',${flavor.colorScheme === 'dark'})})()`
}

/**
 * The boot rows for the current Host state: empty when no flavour is persisted
 * (`off`), when the config carries no volatile ref (legacy seam — see the
 * module header), or when the value names no known flavour.
 * @param config - the plugin config the Loader hands `apply`.
 * @returns rows to `push` into the `webserver/index-inject` table.
 */
export function bootPaletteRows(config: BootPaletteConfig | undefined): BootPaletteRow[] {
  const flavorId = readVolatile(config?.flavor)
  if (typeof flavorId !== 'string') return []
  const flavor = CATPPUCCIN_FLAVORS.find((candidate) => candidate.themeId === flavorId)
  if (flavor === undefined) return []
  const overrides = cssSafeOverrides(readVolatile(config?.overrides))
  return [
    { kind: 'html', placement: 'head', html: bootPaletteStyle(flavor, overrides) },
    { kind: 'script', placement: 'body', text: bootPaletteScript(flavor) },
  ]
}
