/**
 * Client half of the pre-paint palette (issue #30 补充, 2026-10-27).
 *
 * The Host injects a `<style data-dsh-catppuccin-boot>` into the index HTML so
 * the first frame is already the persisted flavour (see `src/boot-palette.ts`).
 * That sheet is only a stand-in: its selector is `html body` (0,0,2), which
 * outranks the official `body` token block, so leaving it in place would pin
 * every token and defeat later theme switches (the user picks Light or turns the
 * flavour off and nothing changes).
 *
 * So it is removed the moment the flavour theme actually takes over — which is
 * NOT the same instant as "setTheme was called":
 *  - a reload where the runtime preference already equals the flavour id never
 *    calls setTheme (see `applyDesired`'s early return), and
 *  - a built-in pick (Light / Dark / System) must remove it too, because the
 *    sheet belongs to a flavour that is no longer wanted.
 * The restore effect therefore clears it from every one of those points plus a
 * fallback timer and the effect teardown.
 */
import { BOOT_PALETTE_ATTR } from '../boot-palette.ts'

/**
 * Remove every injected pre-paint sheet from this document.
 *
 * Idempotent and safe when nothing was injected (hosts without the index
 * injection seam, `flavor: off`, a document that already cleared it).
 * @returns whether an element was actually removed (diagnostics and tests).
 */
export function clearBootPalette(): boolean {
  let removed = false
  for (const element of document.querySelectorAll(`[${BOOT_PALETTE_ATTR}]`)) {
    element.remove()
    removed = true
  }
  return removed
}
