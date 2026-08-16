/**
 * Catppuccin glass settings row — registered into the General settings
 * section (`settings.general.item`, right under the Catppuccin flavour row).
 * Holds the master on/off switch plus every glass knob: mode (mica /
 * compatibility), blur, frost, backdrop brightness and ambient hue. Every
 * write goes straight through to the glass layer, so the skin moves live.
 */
import { useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GlassRowState } from './glass-layer.ts'
import css from './GlassRow.module.css'

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
  /** Set the ambient hue shift, degrees. */
  setHue: (value: number) => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type GlassRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'catppuccin'> & GlassRowInjected

/** One slider + number box, wired to a single value. */
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
  const clamp = (n: number): number => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min))
  return (
    <label className={css.knob}>
      <span className={css.knobLabel}>{label}</span>
      <input
        type="range"
        className={css.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => { onChange(clamp(Number(e.target.value))) }}
      />
      <span className={css.numberWrap}>
        <input
          type="number"
          className={css.number}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => { onChange(clamp(Number(e.target.value))) }}
        />
        <span className={css.unit}>{unit}</span>
      </span>
    </label>
  )
}

/** A two-option segmented picker. */
function Segmented<T extends string>(props: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onSelect: (value: T) => void
}): React.JSX.Element {
  const { label, value, options, onSelect } = props
  return (
    <div className={css.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={option.id === value ? css.segActive : css.seg}
          aria-pressed={option.id === value}
          onClick={() => { onSelect(option.id) }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Render the glass row: title, the master switch, and — while enabled — the
 * mode picker and every knob.
 * @param props - composed slot props.
 * @returns the General section row.
 */
export function GlassRow({ t, getState, subscribe, setEnabled, setMode, setBlur, setFrost, setBrightness, setHue }: GlassRowProps): React.JSX.Element {
  const state = useSyncExternalStore(subscribe, getState)
  const { enabled, mode, blur, frost, brightness, hue, dark } = state

  // The brightness knob only ever offers the half that makes sense for the
  // resolved scheme: dark mode darkens (0-50), light mode brightens (50-100).
  const bgMin = dark ? 0 : 50
  const bgMax = dark ? 50 : 100
  const bgDisplay = Math.min(bgMax, Math.max(bgMin, brightness))

  return (
    <div className={css.group}>
      <div className={css.title}>{t('glass.title')}</div>
      <div className={css.description}>{t('glass.description')}</div>
      <div className={css.controls}>
        <div className={css.row}>
          <span className={css.rowLabel}>{t('glass.enable')}</span>
          <button
            type="button"
            className={enabled ? css.toggleOn : css.toggle}
            aria-pressed={enabled}
            onClick={() => { setEnabled(!enabled) }}
          >
            <span className={css.check}>{enabled ? '✓' : ''}</span>
            {enabled ? t('glass.on') : t('glass.off')}
          </button>
        </div>
        {enabled && (
          <>
            <div className={css.row}>
              <span className={css.rowLabel}>{t('glass.mode')}</span>
              <Segmented
                label={t('glass.mode')}
                value={mode}
                options={[
                  { id: 'mica', label: t('glass.modeMica') },
                  { id: 'compat', label: t('glass.modeCompat') },
                ]}
                onSelect={setMode}
              />
            </div>
            <div className={css.rowHint}>{t('glass.modeHint')}</div>
            <Knob label={t('glass.blur')} value={blur} min={0} max={40} step={0.5} unit="px" onChange={setBlur} />
            <Knob label={t('glass.frost')} value={frost} min={0} max={100} step={1} unit="%" onChange={setFrost} />
            <Knob label={t('glass.brightness')} value={bgDisplay} min={bgMin} max={bgMax} step={1} unit="%" onChange={setBrightness} />
            <div className={css.knobHint}>
              {t(dark ? 'glass.brightnessHintDark' : 'glass.brightnessHintLight')}
            </div>
            <Knob label={t('glass.hue')} value={hue} min={0} max={360} step={1} unit="°" onChange={setHue} />
            <div className={css.knobHint}>{t('glass.hueHint')}</div>
          </>
        )}
      </div>
    </div>
  )
}
