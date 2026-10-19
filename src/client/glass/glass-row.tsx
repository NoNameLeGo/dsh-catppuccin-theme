/**
 * Catppuccin glass settings row — the second row of the plugin's own settings
 * page (issue #27) and of the plugin detail card. Holds the master on/off
 * switch plus every glass knob: mode (mica / compatibility), blur, frost and
 * backdrop brightness. Every write goes straight through to the glass layer,
 * so the skin moves live.
 *
 * Issue #27 (visual language): the two toggles are the official `Switch` atom
 * and the mode pick is the official `SegmentedControl`; the presets are
 * official `Button`s (a SegmentedControl cannot express "no preset matches").
 * The knobs stay a hand-drawn range — upstream ships no slider primitive — but
 * the value beside each slider is an editable box on the official input
 * geometry, so a precise value no longer has to be dragged.
 */
import { useId, useState, useSyncExternalStore } from 'react'
import { Button, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SETTINGS_DEFAULTS, type GlassRowState } from './glass-layer.ts'
import type { CatppuccinKey } from '../locales.ts'
import { HelpBadge } from '../HelpBadge.tsx'
import css from './GlassRow.module.css'
import rowCss from '../settings-row.module.css'

/** Injected business face: the layer state seat plus every knob write. */
export interface GlassRowInjected {
  /** Current layer state snapshot. */
  getState: () => GlassRowState
  /** Subscribe to layer state changes. Returns the disposer. */
  subscribe: (listener: () => void) => () => void
  /** Switch the glass layer on or off. */
  setEnabled: (enabled: boolean) => void
  /** Set the rendering mode ('mica' floating cards or 'compat' stock layout). */
  setMode: (mode: 'mica' | 'compat') => void
  /** Set the glass blur radius, px. */
  setBlur: (value: number) => void
  /** Set the glass frost amount, 0-100. */
  setFrost: (value: number) => void
  /** Set the backdrop brightness, 0-100. */
  setBrightness: (value: number) => void
  /** Toggle the two static ground glows (issue #26; wash-only is the default). */
  setGlow: (value: boolean) => void
  /** Restore every knob to the shipped defaults. */
  resetDefaults: () => void
  /** Close the settings surface so the user can look at the real main UI. The
   *  only honest preview of a LAYOUT switch: mica vs compat restyles the header,
   *  sidebar, composer and bubbles, none of which live on this page. Absent
   *  where the row cannot close anything (the plugin detail card), in which case
   *  the button is not offered. */
  onPreviewMain?: () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type GlassRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'catppuccin'> & GlassRowInjected

/** Number formatting for the value box: no float noise from the 0.5 step. */
const formatValue = (value: number): string => String(Math.round(value * 100) / 100)

/**
 * One slider plus an editable value box, wired to a single number.
 *
 * Editing contract (issue #27): the box stages what is typed and commits on
 * Enter or blur — never per keystroke. Per-keystroke writes would re-run the
 * layer's setters (and the debounced persist) on every character, which is the
 * same trap item TT hit on the token-override editor. Out-of-range drafts clamp,
 * garbage reverts, Escape drops the draft, and Up/Down step by the axis step.
 */
function Knob(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}): React.JSX.Element {
  const { label, value, min, max, step, unit, onChange } = props
  const [draft, setDraft] = useState<string | null>(null)
  const labelId = `${useId()}-knob`

  /** Clamp to the axis, then snap to the step (float noise rounded away). */
  const clampSnap = (n: number): number => {
    const clamped = Math.min(max, Math.max(min, Number.isFinite(n) ? n : value))
    const snapped = Math.round(clamped / step) * step
    return Math.min(max, Math.max(min, Math.round(snapped * 1000) / 1000))
  }

  const commit = (): void => {
    if (draft === null) return
    const parsed = Number.parseFloat(draft.replace(',', '.'))
    setDraft(null)
    if (!Number.isFinite(parsed)) return
    const next = clampSnap(parsed)
    if (next !== value) onChange(next)
  }

  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0

  return (
    <div className={css.knob}>
      <span className={css.knobLabel} id={labelId}>{label}</span>
      <input
        type="range"
        className={css.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        // Item Z: the raw number is announced without its unit otherwise. The
        // qualitative tier names stay out of the locale dictionaries on purpose
        // (7 languages × 3 knobs of invented copy buys little over parity).
        aria-labelledby={labelId}
        aria-valuetext={`${value}${unit}`}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => { onChange(clampSnap(Number(e.target.value))) }}
      />
      <span className={css.numberWrap}>
        <input
          type="text"
          inputMode="decimal"
          className={css.number}
          aria-labelledby={labelId}
          value={draft ?? formatValue(value)}
          onChange={(e) => { setDraft(e.target.value) }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(null)
              e.currentTarget.blur()
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              // The axis step, not the browser's default caret move.
              e.preventDefault()
              setDraft(null)
              onChange(clampSnap(value + (e.key === 'ArrowUp' ? step : -step)))
            }
          }}
        />
        <span className={css.unit}>{unit}</span>
      </span>
    </div>
  )
}

/** One-click material presets — blur/frost/brightness triples the row applies
 *  through the existing setters (the debounced persist coalesces the burst
 *  into one Host write). Brightness stays neutral (50) so every preset works
 *  in both schemes; the knobs remain for fine tuning. */
const GLASS_PRESETS: readonly { id: string; key: CatppuccinKey; blur: number; frost: number; brightness: number }[] = [
  { id: 'clear', key: 'glass.presetClear', blur: 0, frost: 8, brightness: 50 },
  { id: 'standard', key: 'glass.presetStandard', blur: SETTINGS_DEFAULTS.blur, frost: SETTINGS_DEFAULTS.frost, brightness: SETTINGS_DEFAULTS.brightness },
  { id: 'frosted', key: 'glass.presetFrosted', blur: 12, frost: 45, brightness: 50 },
]

/**
 * Render the glass row: title, the master switch, and — while enabled — the
 * mode picker and every knob.
 * @param props - composed slot props.
 * @returns the settings row.
 */
export function GlassRow({ t, getState, subscribe, setEnabled, setMode, setBlur, setFrost, setBrightness, setGlow, resetDefaults, onPreviewMain }: GlassRowProps): React.JSX.Element {
  const state = useSyncExternalStore(subscribe, getState)
  const { enabled, mode, blur, frost, brightness, glow, dark } = state

  // The brightness knob only ever offers the half that makes sense for the
  // resolved scheme: dark mode darkens (0-50), light mode brightens (50-100).
  const bgMin = dark ? 0 : 50
  const bgMax = dark ? 50 : 100
  const bgDisplay = Math.min(bgMax, Math.max(bgMin, brightness))

  // The preset whose knobs exactly match the live state (none = custom).
  const activePreset = GLASS_PRESETS.find(
    (p) => p.blur === blur && p.frost === frost && p.brightness === brightness,
  )?.id ?? ''

  return (
    <div className={rowCss.row} data-catppuccin-row="glass">
      <div className={rowCss.title}>
        {t('glass.title')}
        <HelpBadge label={t('glass.helpLabel')} help={t('glass.help')} />
      </div>
      <div className={rowCss.desc}>{t('glass.description')}</div>
      <div className={css.controls}>
        <div className={css.row}>
          <span className={css.rowLabel}>{t('glass.enable')}</span>
          <Switch checked={enabled} onChange={(next) => { setEnabled(next) }} label={t('glass.enable')} />
        </div>
        {enabled && (
          <>
            <div className={css.row}>
              <span className={css.rowLabel}>{t('glass.mode')}</span>
              <SegmentedControl
                id="catppuccin-glass-mode"
                label={t('glass.mode')}
                value={mode}
                options={[
                  { value: 'mica' as const, label: t('glass.modeMica') },
                  { value: 'compat' as const, label: t('glass.modeCompat') },
                ]}
                onChange={(next) => { setMode(next) }}
              />
              {/* Mode restyles surfaces that are NOT on this page (header card,
                  sidebar sheet, composer, bubbles), so the picker cannot show
                  its own result. Closing the settings surface is the only
                  preview that is not a drawing of the UI — and unlike a
                  thumbnail it cannot go stale. */}
              {onPreviewMain !== undefined && (
                <Button size="sm" variant="ghost" onClick={onPreviewMain}>
                  {t('glass.previewMode')}
                </Button>
              )}
            </div>
            <div className={css.rowHint}>{t('glass.modeHint')}</div>
            <div className={css.row}>
              <span className={css.rowLabel}>{t('glass.presets')}</span>
              <div className={css.presetGroup} role="group" aria-label={t('glass.presets')}>
                {GLASS_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    size="sm"
                    variant={activePreset === preset.id ? 'primary' : 'outline'}
                    aria-pressed={activePreset === preset.id}
                    onClick={() => {
                      setBlur(preset.blur)
                      setFrost(preset.frost)
                      setBrightness(preset.brightness)
                    }}
                  >
                    {t(preset.key)}
                  </Button>
                ))}
              </div>
            </div>
            <Knob label={t('glass.blur')} value={blur} min={0} max={40} step={0.5} unit="px" onChange={setBlur} />
            <Knob label={t('glass.frost')} value={frost} min={0} max={100} step={1} unit="%" onChange={setFrost} />
            <Knob label={t('glass.brightness')} value={bgDisplay} min={bgMin} max={bgMax} step={1} unit="%" onChange={setBrightness} />
            <div className={css.rowHint}>
              {t(dark ? 'glass.brightnessHintDark' : 'glass.brightnessHintLight')}
            </div>
            {/* Issue #26: the ground glows are opt-in. The switch sits with the
                other material knobs, AFTER the sliders, because it is a
                different axis (a fixed-to-screen light field, not a property of
                the glass panes) — the hint says what it buys and what it costs,
                since the reporter's complaint was exactly the cost. */}
            <div className={css.row}>
              <span className={css.rowLabel}>{t('glass.glow')}</span>
              <Switch checked={glow} onChange={(next) => { setGlow(next) }} label={t('glass.glow')} />
            </div>
            <div className={css.rowHint}>{t('glass.glowHint')}</div>
            {/* Ground sample: brightness and the glow switch move the PAGE
                ground, which this dialog covers with its own bluish fill — so
                both knobs were unverifiable in place. The strip is painted by
                the body's ground rule itself (`glass.module.css` lists both
                selectors, one declaration), so what it shows is the page, not
                an illustration of it. No blur: the strip IS the ground. */}
            <div className={css.sampleRow}>
              <span className={css.knobLabel}>{t('glass.previewGround')}</span>
              <div className={css.groundSample} data-dsh-glass-ground-sample="" aria-hidden="true" />
            </div>
            <div className={css.rowHint}>{t('glass.previewGroundHint')}</div>
            <div className={css.row}>
              <Button size="sm" variant="outline" onClick={() => { resetDefaults() }}>
                {t('glass.reset')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
