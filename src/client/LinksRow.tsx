/**
 * "Feedback & support" settings row — the section's closing row: a link to
 * the GitHub issue tracker and a link to the repository (the polite star
 * ask). Added 2026-10-11: the plugin previously had NO in-app path to either
 * — a user who hit a problem had to already know the repo exists.
 *
 * No injected face on purpose: the row is pure copy plus two static URLs, so
 * it registers without an `inject` factory (the locale seat is all it needs)
 * and renders identically in both homes — the General settings section and
 * the plugin's own detail page in the Plugin manager (`detail-card.tsx`).
 *
 * Both links open in a new tab/window (`target="_blank"`): without it the
 * click would navigate the DSH UI itself away from the app.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * GitHub repository — where a star lands. Keep the `-theme` name: it is the
 * current repo name (the pre-rename URL only redirects), and only COMPLETE
 * GitHub URLs use it (AGENTS.md「项目身份速览：三套名字」).
 */
export const REPO_URL = 'https://github.com/NoNameLeGo/dsh-catppuccin-theme'

/** GitHub issue tracker — where feedback lands. */
export const ISSUES_URL = `${REPO_URL}/issues`

/** Full component props: runtime share + locale seat. No injected face. */
export type LinksRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'catppuccin'>

/** The row's links: token-coloured, underlined, quiet. */
const linkStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-state-business-primary)',
  fontSize: 12,
  lineHeight: '18px',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

/**
 * Render the feedback row: a title and the two links.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function LinksRow({ t }: LinksRowProps): React.JSX.Element {
  return (
    <div style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
      <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '22px' }}>
        {t('links.title')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener" style={linkStyle}>
          {t('links.issue')}
        </a>
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener" style={linkStyle}>
          {t('links.star')}
        </a>
      </div>
    </div>
  )
}
