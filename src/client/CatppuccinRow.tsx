/**
 * Catppuccin settings row — one General-section preference row listing the
 * four flavour themes plus a "follow system" (off) choice. Selecting a
 * flavour calls the injected `select`, which switches the official
 * ThemeRuntime and persists the choice. The row subscribes to `theme/change`
 * so the highlighted flavour tracks the live preference.
 */
import { useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FlavorChoice } from './index.ts'

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
}

/** Full component props: runtime share + locale seat + injected face. */
export type CatppuccinRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'catppuccin'> & CatppuccinRowInjected

/**
 * Render the Catppuccin row: title, one swatch button per flavour, and a
 * follow-system button. The active flavour is highlighted; clicking a flavour
 * applies it immediately (live, no restart) and persists the choice.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function CatppuccinRow({ t, themes, current, subscribe, select }: CatppuccinRowProps): React.JSX.Element {
  const choice = useSyncExternalStore(subscribe, current)
  return (
    <div style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
      <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '22px' }}>
        {t('row.title')}
      </div>
      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
        {t('row.description')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {themes.map((flavor) => {
          const selected = choice === flavor.id
          return (
            <button
              key={flavor.id}
              type="button"
              aria-pressed={selected}
              onClick={() => void select(flavor.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${selected ? 'var(--dsw-alias-border-l3)' : 'var(--dsw-alias-border-l1)'}`,
                background: selected ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
                color: 'var(--dsw-alias-label-primary)',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: flavor.accent, flex: 'none' }} />
              {flavor.label}
            </button>
          )
        })}
        <button
          key="off"
          type="button"
          aria-pressed={choice === 'off'}
          onClick={() => void select('off')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${choice === 'off' ? 'var(--dsw-alias-border-l3)' : 'var(--dsw-alias-border-l1)'}`,
            background: choice === 'off' ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
            color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          {t('row.off')}
        </button>
      </div>
    </div>
  )
}
