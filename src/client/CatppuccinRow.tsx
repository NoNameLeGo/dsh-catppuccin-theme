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
 *
 * Recipes, the segmented pick and the switch come from ./controls.tsx, so
 * every row in this plugin shares one geometry and one selection language.
 */
import { useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FlavorChoice } from './index.ts'
import type { ShikiStyle } from '../state.ts'
import type { CatppuccinKey } from './locales.ts'
import {
  CARD,
  DESCRIPTION,
  ENTRY,
  HelpBadge,
  INPUT,
  ROW,
  ROW_LABEL,
  SWATCH_ACTIVE,
  SWATCH_BASE,
  TITLE,
  actionButton,
  Segmented,
} from './controls.tsx'

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

/** The localised subtitle of one flavour button (`flavor.<id>.subtitle`);
 *  null when the active locale carries no such key. */
function subtitleText(buttonId: string, t: (key: CatppuccinKey) => string): string | null {
  const flavorId = buttonId.replace('catppuccin-', '')
  if (flavorId === buttonId) return null
  const key = `flavor.${flavorId}.subtitle` as CatppuccinKey
  const text = t(key)
  return text === key ? null : text
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
  // Override editor example value: the live flavour's accent instead of a
  // hardcoded Mocha blue (the placeholder used to lie on the other flavours).
  const accentHint = themes.find((flavor) => flavor.id === choice)?.accent ?? 'var(--dsw-static-blue-500)'
  const [overridesOpen, setOverridesOpen] = useState(false)
  // Unsaved editor rows: key+value inputs that only enter the override map
  // once both fields hold a value (power users type tokens, so the commit is
  // live — nothing to "save").
  const [draftRows, setDraftRows] = useState<Array<{ key: string; value: string }>>([])

  const commitDraft = (index: number, key: string, value: string): void => {
    if (key.trim() !== '' && value.trim() !== '') {
      setOverrides({ ...overrideMap, [key.trim()]: value })
      setDraftRows(draftRows.filter((_, i) => i !== index))
    } else {
      setDraftRows(draftRows.map((row, i) => (i === index ? { key, value } : row)))
    }
  }

  const commitPersistedKey = (oldKey: string, newKey: string): void => {
    if (newKey === oldKey) return
    const next = { ...overrideMap }
    delete next[oldKey]
    if (newKey.trim() !== '') next[newKey.trim()] = overrideMap[oldKey]
    setOverrides(next)
  }

  const commitPersistedValue = (key: string, value: string): void => {
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
    <div style={ROW}>
      <div style={TITLE}>
        {t('row.title')}
        <HelpBadge label={t('row.helpLabel')} help={t('row.help')} />
      </div>
      <div style={DESCRIPTION}>
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
                ...(selected ? SWATCH_ACTIVE : SWATCH_BASE),
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
          style={choice === 'off' ? SWATCH_ACTIVE : SWATCH_BASE}
        >
          {t('row.off')}
        </button>
      </div>

      {/* Shiki style pick (item M). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <span style={ROW_LABEL}>
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
          style={{ ...actionButton(), alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}
        >
          {overridesOpen ? `▾` : `▸`} {t('row.overrides')} ({Object.keys(overrideMap).length})
        </button>
        {overridesOpen && (
          <div style={{ ...CARD, gap: 8 }}>
            <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
              {t('row.overridesHint')}
            </div>
            {Object.keys(overrideMap).length === 0 && draftRows.length === 0 && (
              <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
                {t('row.overridesEmpty')}
              </div>
            )}
            {Object.entries(overrideMap).map(([key, value]) => (
              <div key={key} style={{ ...ENTRY, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label={t('row.overridesKey')}
                  value={key}
                  onChange={(e) => { commitPersistedKey(key, e.target.value) }}
                  placeholder="--dsw-static-blue-500"
                  style={{ flex: '1 1 220px', ...INPUT }}
                />
                <input
                  type="text"
                  aria-label={t('row.overridesValue')}
                  value={value}
                  onChange={(e) => { commitPersistedValue(key, e.target.value) }}
                  placeholder={accentHint}
                  style={{ flex: '1 1 140px', ...INPUT }}
                />
                <button
                  type="button"
                  aria-label={t('row.overridesRemove')}
                  onClick={() => { removePersisted(key) }}
                  style={{ ...actionButton(), padding: '4px 8px', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            {draftRows.map((row, index) => (
              <div key={`draft-${index}`} style={{ ...ENTRY, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label={t('row.overridesKey')}
                  value={row.key}
                  onChange={(e) => { commitDraft(index, e.target.value, row.value) }}
                  placeholder="--dsw-static-blue-500"
                  style={{ flex: '1 1 220px', ...INPUT }}
                />
                <input
                  type="text"
                  aria-label={t('row.overridesValue')}
                  value={row.value}
                  onChange={(e) => { commitDraft(index, row.key, e.target.value) }}
                  placeholder={accentHint}
                  style={{ flex: '1 1 140px', ...INPUT }}
                />
                <button
                  type="button"
                  aria-label={t('row.overridesRemove')}
                  onClick={() => { setDraftRows(draftRows.filter((_, i) => i !== index)) }}
                  style={{ ...actionButton(), padding: '4px 8px', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => { setDraftRows([...draftRows, { key: '', value: '' }]) }}
              style={{ ...actionButton(), alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}
            >
              + {t('row.overridesAdd')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}