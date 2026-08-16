/**
 * Runtime seam stamper for the Catppuccin glass layer.
 *
 * The glass stylesheet keys off stable data-* hooks (`data-dsh-glass-frame`,
 * `data-dsh-glass-trajectory`, `data-dsh-glass-stats`, …) that are NOT part
 * of the stock DSH markup, so this module stamps them onto the matching
 * elements at runtime — the stylesheet works with zero base edits. Each
 * selector uses only stable attributes already present in the stock UI
 * (`data-composer-card`, `data-conversation-composer-overlay`, `data-slot`,
 * ARIA roles) or lightningcss-preserved class-name substrings.
 *
 * Stamps are idempotent and inert without the `data-dsh-glass` root attribute
 * (the whole stylesheet is gated on it), so they are simply left in place when
 * the layer flips off — "off" still renders the exact stock UI.
 */

interface Seam {
  /** Attribute to stamp (bare name; value is always ''). */
  readonly attribute: string
  /** CSS selector for the element(s) to stamp. */
  readonly selector: string
  /** Stamp only the first (topmost) match, not every descendant match. */
  readonly first?: boolean
}

const SEAMS: readonly Seam[] = [
  // The layout frame: the sidebar column's direct parent.
  { attribute: 'data-dsh-glass-frame', selector: ':has(> [class*="sidebarCol"])' },
  // The sidebar content root (topmost `root` under the column — settings
  // internals also carry a `root` class but sit deeper, so first match wins).
  { attribute: 'data-dsh-glass-sidebar-root', selector: '[class*="sidebarCol"] [class*="root"]', first: true },
  // New-session button (a raised-surface seam).
  { attribute: 'data-dsh-glass-surface', selector: 'button[class*="newSession"]' },
  // Trajectory view (the composer-overlay view).
  { attribute: 'data-dsh-glass-trajectory', selector: '[data-conversation-composer-overlay]' },
  // Details panel (topmost `root` under the details column).
  { attribute: 'data-dsh-glass-details', selector: '[class*="detailsCol"] [class*="root"]', first: true },
  // Composer bar root: the composer card's direct parent.
  { attribute: 'data-dsh-glass-inputbar', selector: ':has(> [data-composer-card])' },
  // Composer attach "+" button.
  { attribute: 'data-dsh-glass-add', selector: '[data-composer-card] [class*="add"]' },
  // Session stats line under the composer (composer.dock slot).
  { attribute: 'data-dsh-glass-stats', selector: '[data-slot="conversation.composer.dock"] [class*="root"]' },
]

function stamp(seam: Seam): void {
  if (seam.first) {
    const el = document.querySelector(seam.selector)
    if (el !== null && !el.hasAttribute(seam.attribute)) el.setAttribute(seam.attribute, '')
    return
  }
  for (const el of document.querySelectorAll(seam.selector)) {
    if (!el.hasAttribute(seam.attribute)) el.setAttribute(seam.attribute, '')
  }
}

function stampAll(): void {
  for (const seam of SEAMS) stamp(seam)
}

/**
 * Stamp the seams once, then keep them stamped as React remounts nodes.
 * @returns a disposer that disconnects the observer.
 */
export function startGlassSeamStamper(): () => void {
  stampAll()
  const observer = new MutationObserver(() => { stampAll() })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  return () => { observer.disconnect() }
}
