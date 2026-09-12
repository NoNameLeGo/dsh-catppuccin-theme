/**
 * Shared settings UI for the plugin's own rows — one source of truth for
 * geometry, tokens and the two selection idioms.
 *
 * The plugin injects three rows (flavour / glass / update) into the host's
 * settings page. They had grown three private copies of the same segmented
 * pick and two of the same switch, which drifted apart (padding, separators,
 * on-state colour, knob size). The recipes and the two stateful controls live
 * here; the rows only compose them.
 *
 * Selection language — exactly two idioms, deliberately:
 *  - enumerated pick (shiki style, update channel, glass mode): the host's
 *    "active tab" pair, `state-business-tertiary` fill + `state-business-primary`
 *    text (`--dsw` alias layer, so it follows the active flavour);
 *  - object pick (flavour swatch buttons): `interactive-bg-active` fill +
 *    `state-business-primary` hairline + `label-primary` text.
 *
 * The glass row keeps its own CSS module for the *material* only (blur, glow,
 * translucent knob) and mirrors the numbers below — shape and state semantics
 * are shared, texture belongs to the skin. Focus rings stay with the UA
 * default for the inline-styled controls; the glass CSS draws its own.
 */
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/* ------------------------------------------------------------------ *
 * recipes                                                            *
 * ------------------------------------------------------------------ */

/** Outer row: hairline separator + the host's row rhythm (14/22 + 12/18). */
export const ROW: CSSProperties = {
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '16px 0',
}

/** Row title (14/22, host `groupTitle`). */
export const TITLE: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 14,
  lineHeight: '22px',
  display: 'flex',
  alignItems: 'center',
}

/** Row description (12/18, host `groupSub`). */
export const DESCRIPTION: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
}

/** Inline label that sits next to a control (master switch / mode pick). */
export const ROW_LABEL: CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  lineHeight: '18px',
}

/** Secondary ("ghost") action button. */
export function actionButton(disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    font: 'inherit',
  }
}

/** Object-pick base; the active variant is {@link SWATCH_ACTIVE}. */
export const SWATCH_BASE: CSSProperties = {
  ...actionButton(),
  border: '1px solid var(--dsw-alias-border-l1)',
}

/** Object-pick active: accent hairline + the theme's own "raised" fill. */
export const SWATCH_ACTIVE: CSSProperties = {
  ...SWATCH_BASE,
  border: '1px solid var(--dsw-alias-state-business-primary)',
  background: 'var(--dsw-alias-interactive-bg-active)',
}

/** Text/number input — shared by the override editor and the glass knobs. */
export const INPUT: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '0.5px solid var(--dsw-alias-border-l4)',
  borderRadius: 8,
  padding: '4px 8px',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

/** Card idiom taken from the host (`settings-models` editor/cards):
 *  module surface + 12px radius + 14/16 padding + 14px rhythm. */
export const CARD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '14px 16px',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform)',
}

/** List-entry idiom taken from the host: hairline frame + 10px radius. */
export const ENTRY: CSSProperties = {
  border: '0.5px solid var(--dsw-alias-border-l4)',
  borderRadius: 10,
  padding: 6,
}

/* ------------------------------------------------------------------ *
 * controls                                                           *
 * ------------------------------------------------------------------ */

/** The "?" help affordance: accessible name + native title tooltip. */
export function HelpBadge({ label, help }: { label: string; help: string }): React.JSX.Element {
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

/**
 * Index a segmented pick should focus for one key, clamped to the option
 * range. Pure so the roving-focus math is testable without a DOM.
 * @param current - id of the currently focused (or selected) option.
 * @param direction - arrow direction, or a home/end jump.
 * @param options - the pick's options, in display order.
 * @returns the option index to focus.
 */
export function segmentedTargetIndex(
  current: string,
  direction: 1 | -1 | 'home' | 'end',
  options: readonly { id: string }[],
): number {
  if (direction === 'home') return 0
  if (direction === 'end') return options.length - 1
  const found = options.findIndex((option) => option.id === current)
  const index = found === -1 ? 0 : found
  return Math.min(options.length - 1, Math.max(0, index + direction))
}

/** One enumerated pick. Roving tabindex (WAI-ARIA): only the focused cell is
 *  tabbable, arrows/Home/End move focus WITHOUT selecting, Enter/Space or a
 *  click commits. */
export function Segmented<T extends string>(props: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onSelect: (value: T) => void
}): React.JSX.Element {
  const { label, value, options, onSelect } = props
  const [focused, setFocused] = useState<T | null>(null)
  const refs = useRef(new Map<T, HTMLButtonElement>())

  const focusAt = (index: number): void => {
    const target = options[index]
    if (target === undefined) return
    setFocused(target.id)
    refs.current.get(target.id)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const keys: Record<string, 1 | -1 | 'home' | 'end'> = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
      Home: 'home',
      End: 'end',
    }
    const direction = keys[event.key]
    if (direction === undefined) return
    event.preventDefault()
    focusAt(segmentedTargetIndex(focused ?? value, direction, options))
  }

  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, overflow: 'hidden' }} role="group" aria-label={label}>
      {options.map((option, index) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            ref={(node) => {
              if (node === null) refs.current.delete(option.id)
              else refs.current.set(option.id, node)
            }}
            type="button"
            aria-pressed={active}
            tabIndex={option.id === (focused ?? value) ? 0 : -1}
            onFocus={() => { setFocused(option.id) }}
            onBlur={() => { setFocused((now) => (now === option.id ? null : now)) }}
            onKeyDown={onKeyDown}
            onClick={() => { onSelect(option.id) }}
            style={{
              height: 26,
              padding: '0 12px',
              border: 'none',
              borderLeft: index > 0 ? '1px solid var(--dsw-alias-border-l2)' : undefined,
              background: active ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
              color: active ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)',
              fontSize: 12,
              lineHeight: '18px',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Track recipe for {@link Switch}; exported so a skin can mirror the shape. */
export function switchTrack(on: boolean): CSSProperties {
  return {
    position: 'relative',
    display: 'inline-flex',
    flex: 'none',
    width: 44,
    height: 24,
    padding: 0,
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    background: on ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-bg-layer-2)',
    cursor: 'pointer',
  }
}

/** Knob recipe for {@link Switch} (rides the track, carries the check). */
export function switchKnob(on: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 3,
    left: 3,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: on ? 'var(--dsw-alias-bg-layer-1)' : 'var(--dsw-alias-label-tertiary)',
    color: on ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-tertiary)',
    fontSize: 10,
    lineHeight: 1,
    transform: on ? 'translateX(22px)' : undefined,
    transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
  }
}

/** Boolean switch: on = accent track + surface knob + check. */
export function Switch(props: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}): React.JSX.Element {
  const { label, checked, onChange } = props
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { onChange(!checked) }}
      style={switchTrack(checked)}
    >
      <span aria-hidden="true" style={switchKnob(checked)}>
        {checked ? '✓' : ''}
      </span>
    </button>
  )
}
