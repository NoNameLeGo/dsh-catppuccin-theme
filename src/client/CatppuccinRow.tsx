/**
 * Catppuccin settings row — one General-section preference row listing the
 * four flavour themes plus a "follow system" (off) choice. Selecting a
 * flavour calls the injected `select`, which switches the official
 * ThemeRuntime and persists the choice. The row subscribes to `theme/change`
 * so the highlighted flavour tracks the live preference.
 *
 * Beyond the flavour pick the row carries:
 *  - per-flavour localized subtitles (item DD) under the button labels;
 *  - the shiki style pick (item M, `default` / `italic-comments`);
 *  - a collapsible power-user token-override editor (item K);
 *  - a "?" help affordance (item J) — no framework tooltip API exists in
 *    dsh-client-ui-slots yet, so the help text rides the native `title`
 *    attribute plus an accessible name.
 */
import { useRef, useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FlavorChoice } from './index.ts'
import type { ShikiStyle } from '../state.ts'
import type { CatppuccinKey } from './locales.ts'

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

/** 普通按钮行内样式。 */
const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-l1)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
  font: 'inherit',
}

/** 选中态按钮行内样式。 */
const buttonActive: React.CSSProperties = {
  ...buttonBase,
  border: '1px solid var(--dsw-alias-border-l3)',
  background: 'var(--dsw-alias-interactive-bg-active)',
}

const inputBase: React.CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 6,
  padding: '4px 8px',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

/**
 * A "?" help affordance: an accessible button that carries the full help
 * text in the native `title` tooltip. No visual styling beyond the token
 * palette — the affordance follows the row's label colour.
 */
function HelpIcon({ label, help }: { label: string; help: string }): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label={label}
      title={help}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: 11,
        lineHeight: 1,
        cursor: 'help',
        userSelect: 'none',
        marginLeft: 6,
        flex: 'none',
      }}
    >
      ?
    </span>
  )
}

/** The localised subtitle of one flavour button (`flavor.<id>.subtitle`);
 *  null when the active locale carries no such key. */
function subtitleText(buttonId: string, t: (key: CatppuccinKey) => string): string | null {
  const flavorId = buttonId.replace('catppuccin-', '')
  if (flavorId === buttonId) return null
  const key = `flavor.${flavorId}.subtitle` as CatppuccinKey
  const text = t(key)
  return text === key ? null : text
}

/** One two-sided segmented pick using the row's token colours. */
function Segmented<T extends string>(props: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onSelect: (value: T) => void
}): React.JSX.Element {
  const { label, value, options, onSelect } = props
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, overflow: 'hidden' }} role="group" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => { onSelect(option.id) }}
          style={{
            height: 26,
            padding: '0 12px',
            border: 'none',
            borderLeft: index > 0 ? '1px solid var(--dsw-alias-border-l2)' : undefined,
            background: option.id === value ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
            color: option.id === value ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)',
            fontSize: 12,
            lineHeight: '18px',
            cursor: 'pointer',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Render the Catppuccin row: title, one swatch button per flavour, and a
 * follow-system button. The active flavour is highlighted; clicking a flavour
 * applies it immediately (live, no restart) and persists the choice.
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
    <div style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
      <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '22px', display: 'flex', alignItems: 'center' }}>
        {t('row.title')}
        <HelpIcon label={t('row.helpLabel')} help={t('row.help')} />
      </div>
      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
        {t('row.description')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {themes.map((flavor) => {
          const selected = choice === flavor.id
          const subtitle = subtitleText(flavor.id, t)
          return (
            <button
              key={flavor.id}
              type="button"
              aria-pressed={selected}
              onClick={() => void select(flavor.id)}
              style={{
                ...(selected ? buttonActive : buttonBase),
                flexDirection: subtitle !== null ? 'column' : 'row',
                alignItems: subtitle !== null ? 'flex-start' : 'center',
                gap: subtitle !== null ? 2 : 6,
                padding: subtitle !== null ? '5px 12px' : '6px 12px',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: flavor.accent, flex: 'none' }} />
                {flavor.label}
              </span>
              {subtitle !== null && (
                <span style={{ fontSize: 10, lineHeight: '14px', color: 'var(--dsw-alias-label-tertiary)' }}>
                  {subtitle}
                </span>
              )}
            </button>
          )
        })}
        <button
          key="off"
          type="button"
          aria-pressed={choice === 'off'}
          onClick={() => void select('off')}
          style={choice === 'off' ? buttonActive : buttonBase}
        >
          {t('row.off')}
        </button>
      </div>

      {/* Shiki style pick (item M). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' }}>
          {t('row.shikiStyle')}
        </span>
        <Segmented
          label={t('row.shikiStyle')}
          value={style}
          options={[
            { id: 'default' as const, label: t('row.shikiDefault') },
            { id: 'italic-comments' as const, label: t('row.shikiItalicComments') },
          ]}
          onSelect={setShikiStyle}
        />
      </div>

      {/* Power-user token overrides (item K). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button
          type="button"
          aria-expanded={overridesOpen}
          onClick={() => { setOverridesOpen(!overridesOpen) }}
          style={{ ...buttonBase, alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}
        >
          {overridesOpen ? `▾` : `▸`} {t('row.overrides')} ({Object.keys(overrideMap).length})
        </button>
        {overridesOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
              {t('row.overridesHint')}
            </div>
            {Object.keys(overrideMap).length === 0 && draftRows.length === 0 && (
              <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
                {t('row.overridesEmpty')}
              </div>
            )}
            {Object.entries(overrideMap).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label={t('row.overridesKey')}
                  defaultValue={key}
                  onBlur={(e) => { commitPersistedKey(key, e.target.value) }}
                  placeholder="--dsw-static-blue-500"
                  style={{ flex: '1 1 220px', ...inputBase }}
                />
                <input
                  type="text"
                  aria-label={t('row.overridesValue')}
                  defaultValue={value}
                  onBlur={(e) => { commitPersistedValue(key, e.target.value) }}
                  placeholder="#89b4fa"
                  style={{ flex: '1 1 140px', ...inputBase }}
                />
                <button
                  type="button"
                  aria-label={t('row.overridesRemove')}
                  onClick={() => { removePersisted(key) }}
                  style={{ ...buttonBase, padding: '4px 8px', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            {draftRows.map((row, index) => (
              <div key={row.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label={t('row.overridesKey')}
                  defaultValue={row.key}
                  onBlur={(e) => { commitDraftKey(index, e.target.value) }}
                  placeholder="--dsw-static-blue-500"
                  style={{ flex: '1 1 220px', ...inputBase }}
                />
                <input
                  type="text"
                  aria-label={t('row.overridesValue')}
                  defaultValue={row.value}
                  onBlur={(e) => { commitDraftValue(index, e.target.value) }}
                  placeholder="#89b4fa"
                  style={{ flex: '1 1 140px', ...inputBase }}
                />
                <button
                  type="button"
                  aria-label={t('row.overridesRemove')}
                  onClick={() => { setDraftRows(draftRows.filter((_, i) => i !== index)) }}
                  style={{ ...buttonBase, padding: '4px 8px', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                nextDraftId.current += 1
                setDraftRows([...draftRows, { id: nextDraftId.current, key: '', value: '' }])
              }}
              style={{ ...buttonBase, alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}
            >
              + {t('row.overridesAdd')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}