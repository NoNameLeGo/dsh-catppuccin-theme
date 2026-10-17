/**
 * Shared "?" help badge used by the settings rows.
 *
 * Not an official primitive: dsh-client-ui-primitives ships `Tooltip`, but it
 * wants an anchor/focus contract (delay, dismissal, collision) that the rows do
 * not own. The badge carries the full help text in the native `title` attribute
 * plus an accessible name, which is what the rows shipped before issue #27 and
 * what they keep — only its styling moved into the shared row stylesheet.
 */
import rowCss from './settings-row.module.css'

/**
 * Render the badge.
 * @param props.label - accessible name (localized "what is this" copy).
 * @param props.help - the full help text, shown by the native tooltip.
 * @returns the badge element.
 */
export function HelpBadge({ label, help }: { label: string; help: string }): React.JSX.Element {
  return (
    <span role="img" aria-label={label} title={help} className={rowCss.help}>
      ?
    </span>
  )
}
