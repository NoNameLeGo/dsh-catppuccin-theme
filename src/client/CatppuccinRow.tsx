/**
 * Catppuccin flavour row — the first row of the plugin's own settings page
 * (issue #27) and of the plugin detail card. It lists the four flavour themes
 * plus a "follow system" (off) choice. Selecting a flavour calls the injected
 * `select`, which switches the official ThemeRuntime and persists the choice.
 * The row subscribes to `theme/change` so the highlighted flavour tracks the
 * live preference.
 *
 * Beyond the flavour pick the row carries:
 *  - per-flavour localized subtitles (item DD) under the button labels;
 *  - the shiki style pick (item M, `default` / `italic-comments`);
 *  - a collapsible power-user token-override editor (item K);
 *  - a "?" help affordance (item J) — no framework tooltip API exists in
 *    dsh-client-ui-slots yet, so the help text rides the native `title`
 *    attribute plus an accessible name.
 *
 * Issue #27 (visual language): the controls here are no longer hand-drawn
 * shapes. The flavour picker follows the official Appearance row's cube
 * geometry (see CatppuccinRow.module.css for the two deliberate deviations),
 * and the shiki pick is the official `SegmentedControl` atom — the same one
 * the official Models page uses as a plain mode picker.
 */
import { useRef, useState, useSyncExternalStore } from 'react'
import { Button, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FlavorChoice } from './index.ts'
import type { ShikiStyle } from '../state.ts'
import type { CatppuccinKey } from './locales.ts'
import { HelpBadge } from './HelpBadge.tsx'
import css from './CatppuccinRow.module.css'
import rowCss from './settings-row.module.css'

/** One flavour button shown by the row. */
export interface CatppuccinFlavorButton {
  /** Theme id registered into ThemeRuntime. */
  id: string
  /** Display label. */
  label: string
  /** Accent colour for the swatch. */
  accent: string
}

/** Injected business face of the row (assembled in apply). */
export interface CatppuccinRowInjected {
  /** The four flavours, in display order. */
  themes: readonly CatppuccinFlavorButton[]
  /** Current choice (`off` when a Catppuccin theme is not active). */
  current: () => FlavorChoice
  /** Subscribe to theme preference changes. Returns the disposer. */
  subscribe: (listener: () => void) => () => void
  /** Switch the theme and persist the choice (`off` reverts to system). */
  select: (choice: FlavorChoice) => void | Promise<void>
  /** Current user token overrides (item K). */
  overrides: () => Record<string, string>
  /** Replace the whole override map (persists + re-registers the theme). */
  setOverrides: (overrides: Record<string, string>) => void
  /** Current shiki style (item M). */
  shikiStyle: () => ShikiStyle
  /** Set the shiki style (persists + re-registers the theme). */
  setShikiStyle: (style: ShikiStyle) => void
  /** Subscribe to preference (overrides / shiki style) changes. */
  subscribePrefs: (listener: () => void) => () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type CatppuccinRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'catppuccin'> & CatppuccinRowInjected

/** Per-flavour one-line subtitle (item DD). */
function subtitleText(id: string, t: (key: CatppuccinKey) => string): string | null {
  switch (id) {
    case 'catppuccin-latte': return t('flavor.latte.subtitle')
    case 'catppuccin-frappe': return t('flavor.frappe.subtitle')
    case 'catppuccin-macchiato': return t('flavor.macchiato.subtitle')
    case 'catppuccin-mocha': return t('flavor.mocha.subtitle')
    default: return null
  }
}

/**
 * Render the Catppuccin row: title, one cube per flavour, and a follow-system
 * cube. The active flavour is highlighted; clicking a flavour applies it
 * immediately (live, no restart) and persists the choice.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function CatppuccinRow({
  t,
  themes,
  current,
  subscribe,
  select,
  overrides,
  setOverrides,
  shikiStyle,
  setShikiStyle,
  subscribePrefs,
}: CatppuccinRowProps): React.JSX.Element {
  const choice = useSyncExternalStore(subscribe, current)
  const overrideMap = useSyncExternalStore(subscribePrefs, overrides)
  const style = useSyncExternalStore(subscribePrefs, shikiStyle)
  const [overridesOpen, setOverridesOpen] = useState(false)
  // Unsaved editor rows: key+value inputs that only enter the override map
  // once both fields hold a value (power users type tokens, so the commit is
  // live — nothing to "save").
  //
  // `id` is a stable React key, NOT the array index (audit F5): the fields are
  // uncontrolled, so an index key made React reuse the deleted row's DOM node
  // for the next row after a delete — the input kept showing the removed row's
  // text while the state held the surviving row's value.
  const [draftRows, setDraftRows] = useState<Array<{ id: number; key: string; value: string }>>([])
  const nextDraftId = useRef(0)

  // Only `--`-prefixed keys are persistable (`sanitizeOverrides` drops the
  // rest on every read — localStorage and the settings document share one
  // shape), so an incomplete key stays a draft row instead of being committed
  // and silently dropped one read later.
  const isTokenKey = (key: string): boolean => key.trim().startsWith('--')

  /** Commit a draft row on blur. If both fields are valid, promote to persisted;
   *  otherwise keep in draft state. Item XX: changed from onChange to onBlur so
   *  the row stays stable while typing—typing the first character of the value
   *  previously made the draft immediately promote and unmount the input mid-edit. */
  const commitDraftKey = (index: number, key: string): void => {
    const row = draftRows[index]
    if (isTokenKey(key) && row.value.trim() !== '') {
      setOverrides({ ...overrideMap, [key.trim()]: row.value })
      setDraftRows(draftRows.filter((_, i) => i !== index))
    } else {
      setDraftRows(draftRows.map((r, i) => (i === index ? { ...r, key } : r)))
    }
  }

  const commitDraftValue = (index: number, value: string): void => {
    const row = draftRows[index]
    if (isTokenKey(row.key) && value.trim() !== '') {
      setOverrides({ ...overrideMap, [row.key.trim()]: value })
      setDraftRows(draftRows.filter((_, i) => i !== index))
    } else {
      setDraftRows(draftRows.map((r, i) => (i === index ? { ...r, value } : r)))
    }
  }

  /** Rename (or, with an empty/invalid key, delete) a persisted override. The
   *  key input is uncontrolled and commits on blur: writing on every keystroke
   *  repersisted the entry under each intermediate key, and an intermediate
   *  key that is not a `--` token made the row delete itself mid-typing. */
  const commitPersistedKey = (oldKey: string, newKey: string): void => {
    if (newKey === oldKey) return
    const next = { ...overrideMap }
    delete next[oldKey]
    if (isTokenKey(newKey)) next[newKey.trim()] = overrideMap[oldKey]
    setOverrides(next)
  }

  /** Set (or, with an empty value, delete) a persisted override's value.
   *
   *  Item TT: the value input is uncontrolled and commits on blur, symmetric
   *  with the key input. Per-keystroke commits meant `value.trim() === ''`
   *  deleted the entry while the caret was still in the field, so the row
   *  (input included) unmounted mid-typing — and every keystroke additionally
   *  re-registered the whole theme. Trade-off, accepted deliberately: no more
   *  "recolour as I type" preview (intermediate values like `#89b4` are invalid
   *  CSS anyway, so that preview was only ever complete on paste), and an edit
   *  that never loses focus (dialog closed with Esc) is not committed.
   *
   *  Known trade-off: an uncontrolled input keeps its text when the persisted
   *  value changes from another tab/settings write; the row re-syncs on reopen. */
  const commitPersistedValue = (key: string, value: string): void => {
    if (value === overrideMap[key]) return
    const next = { ...overrideMap }
    if (value.trim() === '') delete next[key]
    else next[key] = value
    setOverrides(next)
  }

  const removePersisted = (key: string): void => {
    const next = { ...overrideMap }
    delete next[key]
    setOverrides(next)
  }

  return (
    <div className={rowCss.row} data-catppuccin-row="flavor">
      <div className={rowCss.title}>
        {t('row.title')}
        <HelpBadge label={t('row.helpLabel')} help={t('row.help')} />
      </div>
      <div className={rowCss.desc}>
        {t('row.description')}
      </div>

      {/* Flavour cubes — official Appearance cube geometry (see the module CSS). */}
      <div className={css.cubes} role="group" aria-label={t('row.title')}>
        {themes.map((flavor) => {
          const selected = choice === flavor.id
          const subtitle = subtitleText(flavor.id, t)
          return (
            <button
              key={flavor.id}
              type="button"
              aria-pressed={selected}
              onClick={() => void select(flavor.id)}
              className={selected ? `${css.cube} ${css.selected}` : css.cube}
            >
              <span className={css.cubeHead}>
                <span aria-hidden="true" className={css.swatch} style={{ background: flavor.accent }} />
                {flavor.label}
              </span>
              {subtitle !== null && (
                <span className={css.subtitle}>{subtitle}</span>
              )}
            </button>
          )
        })}
        <button
          key="off"
          type="button"
          aria-pressed={choice === 'off'}
          onClick={() => void select('off')}
          className={choice === 'off' ? `${css.cube} ${css.selected}` : css.cube}
        >
          <span className={css.cubeHead}>{t('row.off')}</span>
        </button>
      </div>

      {/* Shiki style pick (item M). */}
      <div className={css.shikiRow}>
        <span className={css.shikiLabel}>{t('row.shikiStyle')}</span>
        <SegmentedControl
          id="catppuccin-shiki-style"
          label={t('row.shikiStyle')}
          value={style}
          options={[
            { value: 'default' as ShikiStyle, label: t('row.shikiDefault') },
            { value: 'italic-comments' as ShikiStyle, label: t('row.shikiItalicComments') },
          ]}
          onChange={(next) => { setShikiStyle(next) }}
        />
      </div>

      {/* Power-user token overrides (item K). */}
      <div className={css.overrides}>
        <Button
          size="sm"
          variant="ghost"
          className={css.selfStart}
          aria-expanded={overridesOpen}
          onClick={() => { setOverridesOpen(!overridesOpen) }}
        >
          {overridesOpen ? '▾' : '▸'} {t('row.overrides')} ({Object.keys(overrideMap).length})
        </Button>
        {overridesOpen && (
          <>
            <div className={css.hint}>{t('row.overridesHint')}</div>
            {Object.keys(overrideMap).length === 0 && draftRows.length === 0 && (
              <div className={css.hint}>{t('row.overridesEmpty')}</div>
            )}
            {Object.entries(overrideMap).map(([key, value]) => (
              <div key={key} className={css.overrideRow}>
                <input
                  type="text"
                  aria-label={t('row.overridesKey')}
                  defaultValue={key}
                  onBlur={(e) => { commitPersistedKey(key, e.target.value) }}
                  placeholder="--dsw-static-blue-500"
                  className={css.overrideInput}
                />
                <input
                  type="text"
                  aria-label={t('row.overridesValue')}
                  defaultValue={value}
                  onBlur={(e) => { commitPersistedValue(key, e.target.value) }}
                  placeholder="#89b4fa"
                  className={`${css.overrideInput} ${css.overrideValue}`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('row.overridesRemove')}
                  onClick={() => { removePersisted(key) }}
                >
                  ✕
                </Button>
              </div>
            ))}
            {draftRows.map((row, index) => (
              <div key={row.id} className={css.overrideRow}>
                <input
                  type="text"
                  aria-label={t('row.overridesKey')}
                  defaultValue={row.key}
                  onBlur={(e) => { commitDraftKey(index, e.target.value) }}
                  placeholder="--dsw-static-blue-500"
                  className={css.overrideInput}
                />
                <input
                  type="text"
                  aria-label={t('row.overridesValue')}
                  defaultValue={row.value}
                  onBlur={(e) => { commitDraftValue(index, e.target.value) }}
                  placeholder="#89b4fa"
                  className={`${css.overrideInput} ${css.overrideValue}`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('row.overridesRemove')}
                  onClick={() => { setDraftRows(draftRows.filter((_, i) => i !== index)) }}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className={css.selfStart}
              onClick={() => {
                nextDraftId.current += 1
                setDraftRows([...draftRows, { id: nextDraftId.current, key: '', value: '' }])
              }}
            >
              + {t('row.overridesAdd')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
