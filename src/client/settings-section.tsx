/**
 * The plugin's own settings page (issue #27).
 *
 * Before this file the four preferences were rows in the General section
 * (`settings.general.item`), mixed in with the official preferences and drawn
 * with hand-made controls. They now live on a `settings.section` page with its
 * own nav entry, so the page reads as one feature instead of four rows spliced
 * into someone else's list.
 *
 * The page is a composition, not a fourth implementation: it stacks the exact
 * rows the plugin detail card shows (`plugins.bundle.config`), handed the same
 * injected faces. Both homes read and write the one durable section
 * (`CATPPUCCIN_ENTRY_ID`); the only cost of the second home is that the rows
 * exist twice in the DOM when both are open — each instance subscribes for
 * itself, so no state is shared behind the framework's back.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CatppuccinRow, type CatppuccinRowInjected } from './CatppuccinRow.tsx'
import { GlassRow, type GlassRowInjected } from './glass/glass-row.tsx'
import { LinksRow } from './LinksRow.tsx'
import { UpdateRow, type UpdateRowInjected } from './UpdateRow.tsx'
import css from './settings-section.module.css'
import rowCss from './settings-row.module.css'

/** Injected business face: the three rows' own faces, unchanged. */
export interface CatppuccinSettingsPageInjected {
  /** Catppuccin flavour row (registered themes + pick). */
  flavor: CatppuccinRowInjected
  /** Glass-layer row (enable flag + knobs). */
  glass: GlassRowInjected
  /** Update-check row (version, channel, check button). */
  update: UpdateRowInjected
}

/** Full component props: runtime share (the shell's `close`) + locale + face. */
export type CatppuccinSettingsPageProps =
  PropsRuntime<'settings.section'> & PropsLocale<'catppuccin'> & CatppuccinSettingsPageInjected

/**
 * Render the Catppuccin settings page.
 * @param props - the injected faces plus the framework seats.
 * @returns the page: heading plus the four preference rows.
 */
export function CatppuccinSettingsPage(props: CatppuccinSettingsPageProps): React.JSX.Element {
  return (
    <div className={rowCss.stack} data-catppuccin-settings>
      <h2 className={css.title}>{props.t('page.title')}</h2>
      <CatppuccinRow {...props.flavor} t={props.t} />
      <GlassRow {...props.glass} t={props.t} />
      <UpdateRow {...props.update} t={props.t} />
      <LinksRow t={props.t} />
    </div>
  )
}
