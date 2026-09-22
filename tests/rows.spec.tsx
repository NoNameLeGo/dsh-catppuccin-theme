// @vitest-environment jsdom
/**
 * Settings-row component coverage — the harness the rows never had.
 *
 * Until now the client rows were covered by pure-logic tests plus screenshot
 * review, so interaction-level defects had no guard: item TT (per-keystroke
 * commits unmounting the row you are typing into) was found by reading code,
 * and XX is still open. Every row takes its dependencies as props (no module
 * globals), so a fake injected face is enough to render them.
 *
 * `cleanup` is explicit because this repo runs vitest without `globals`, so
 * Testing Library cannot register its own afterEach hook.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CatppuccinRow, type CatppuccinRowProps } from '../src/client/CatppuccinRow.tsx'
import { GlassRow, type GlassRowProps } from '../src/client/glass/glass-row.tsx'
import { UPDATE_RETRY_AFTER_MS, UpdateRow, type UpdateRowProps } from '../src/client/UpdateRow.tsx'
import type { UpdateChannel } from '../src/update-check.ts'
import { zh, type CatppuccinKey } from '../src/client/locales.ts'
import type { ShikiStyle } from '../src/state.ts'

afterEach(cleanup)

const t = (key: CatppuccinKey): string => zh[key]

/** Flavour buttons the row lists (`themes` is a plain display list). */
const THEMES = [{ id: 'catppuccin-mocha', label: 'Mocha', accent: '#cba6f7' }]

/** Row props with a fake injected face; returns the spies the assertions read. */
function makeRow(overrides: Record<string, string> = {}) {
  let map = { ...overrides }
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  const setOverrides = vi.fn((next: Record<string, string>) => {
    map = next
    notify()
  })
  const props = {
    t,
    themes: THEMES,
    current: () => 'catppuccin-mocha',
    subscribe: () => () => {},
    select: vi.fn(),
    overrides: () => map,
    setOverrides,
    shikiStyle: (): ShikiStyle => 'default',
    setShikiStyle: vi.fn(),
    subscribePrefs: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  } as unknown as CatppuccinRowProps
  return { props, setOverrides }
}

/** Open the collapsible override editor and hand back its row handles. */
function openOverrides(): { key: HTMLInputElement; value: HTMLInputElement } {
  fireEvent.click(screen.getByRole('button', { name: /自定义覆盖/ }))
  return {
    key: screen.getByLabelText(t('row.overridesKey')) as HTMLInputElement,
    value: screen.getByLabelText(t('row.overridesValue')) as HTMLInputElement,
  }
}

describe('CatppuccinRow override editor', () => {
  it('commits an edited value on blur instead of per keystroke (item TT)', () => {
    const { props, setOverrides } = makeRow({ '--dsw-static-blue-500': '#89b4fa' })
    render(<CatppuccinRow {...props} />)
    const { value } = openOverrides()

    fireEvent.change(value, { target: { value: '#ff0000' } })
    // Per-keystroke commits are what used to unmount the row mid-typing.
    expect(setOverrides).not.toHaveBeenCalled()
    expect(value.isConnected).toBe(true)

    fireEvent.blur(value)
    expect(setOverrides).toHaveBeenCalledTimes(1)
    expect(setOverrides.mock.calls[0][0]).toEqual({ '--dsw-static-blue-500': '#ff0000' })
  })

  it('keeps the row mounted while a value is cleared, and deletes it on blur', () => {
    const { props, setOverrides } = makeRow({ '--dsw-static-blue-500': '#89b4fa' })
    render(<CatppuccinRow {...props} />)
    const { value } = openOverrides()

    fireEvent.change(value, { target: { value: '' } })
    expect(setOverrides).not.toHaveBeenCalled()
    expect(value.isConnected).toBe(true) // the defect: the row vanished here

    fireEvent.blur(value)
    expect(setOverrides).toHaveBeenCalledWith({})
  })

  it('writes nothing when the value comes back unchanged', () => {
    const { props, setOverrides } = makeRow({ '--dsw-static-blue-500': '#89b4fa' })
    render(<CatppuccinRow {...props} />)
    const { value } = openOverrides()

    fireEvent.blur(value) // no edit at all
    expect(setOverrides).not.toHaveBeenCalled()
  })

  it('renames a key on blur and keeps the value, dropping a non-token key', () => {
    const { props, setOverrides } = makeRow({ '--dsw-static-blue-500': '#89b4fa' })
    render(<CatppuccinRow {...props} />)
    const { key } = openOverrides()

    fireEvent.change(key, { target: { value: '--dsw-static-green-500' } })
    fireEvent.blur(key)
    expect(setOverrides.mock.calls[0][0]).toEqual({ '--dsw-static-green-500': '#89b4fa' })

    // A key that is not a `--` token is not persistable — the entry goes away
    // instead of lingering in a shape the next read would drop anyway.
    fireEvent.change(screen.getByLabelText(t('row.overridesKey')), { target: { value: 'nope' } })
    fireEvent.blur(screen.getByLabelText(t('row.overridesKey')))
    expect(setOverrides.mock.calls[1][0]).toEqual({})
  })

  it('keeps each draft row on its own text after an earlier draft is removed (audit F5)', () => {
    // The fields are uncontrolled and the rows used their array index as the
    // React key, so removing the first draft made React reuse its DOM node for
    // the surviving row — the input kept displaying the DELETED row's key.
    const { props } = makeRow()
    render(<CatppuccinRow {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /自定义覆盖/ }))

    const add = screen.getByRole('button', { name: `+ ${t('row.overridesAdd')}` })
    fireEvent.click(add)
    fireEvent.click(add)
    expect(screen.getAllByLabelText(t('row.overridesKey'))).toHaveLength(2)

    const type = (index: number, value: string): void => {
      const input = screen.getAllByLabelText(t('row.overridesKey'))[index] as HTMLInputElement
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)
    }
    type(0, '--dsw-static-blue-500')
    type(1, '--dsw-static-green-500')

    // Remove the FIRST draft row: the survivor's field must show ITS text.
    fireEvent.click(screen.getAllByLabelText(t('row.overridesRemove'))[0] as HTMLButtonElement)
    const remaining = screen.getAllByLabelText(t('row.overridesKey')) as HTMLInputElement[]
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.value).toBe('--dsw-static-green-500')
  })
})

describe('UpdateRow timestamp formatting', () => {
  /** Fake face whose subscribed locale listener actually re-renders the row. */
  function makeUpdateRow(initialLocale: string) {
    let locale = initialLocale
    const localeListeners = new Set<() => void>()
    const payload = {
      ok: true,
      current: '0.5.4',
      latest: '0.5.5',
      checkedAt: Date.UTC(2026, 8, 21, 12, 0, 0),
      channel: 'latest',
    }
    const props = {
      t,
      check: async () => payload,
      autoCheck: () => false,
      setAutoCheck: vi.fn(),
      channel: () => 'latest',
      setChannel: vi.fn(),
      subscribePrefs: () => () => {},
      lastAutoResult: () => null,
      subscribeConflict: () => () => {},
      conflictCount: () => 0,
      activeLocale: () => locale,
      subscribeLocale: (listener: () => void) => {
        localeListeners.add(listener)
        return () => { localeListeners.delete(listener) }
      },
    } as unknown as UpdateRowProps
    return {
      props,
      switchLocale: (next: string): void => {
        locale = next
        act(() => { for (const listener of localeListeners) listener() })
      },
    }
  }

  it('formats the check time with the active DSH locale, never the browser default (2026-09-21)', async () => {
    // `toLocaleString()` with no argument uses the JS runtime locale (= browser),
    // which is exactly the drift this guards: the interface language is DSH's own.
    const spy = vi.spyOn(Date.prototype, 'toLocaleString')
    try {
      const { props, switchLocale } = makeUpdateRow('ja')
      render(<UpdateRow {...props} />)
      fireEvent.click(screen.getByRole('button', { name: t('update.check') }))
      await waitFor(() => { expect(spy.mock.calls.some((call) => call[0] === 'ja')).toBe(true) })
      expect(spy.mock.calls.filter((call) => call.length === 0), 'called without a locale').toEqual([])

      // A language switch must re-format the timestamp, not wait for a reload.
      spy.mockClear()
      switchLocale('en')
      await waitFor(() => { expect(spy.mock.calls.some((call) => call[0] === 'en')).toBe(true) })
    } finally {
      spy.mockRestore()
    }
  })
})

/** GlassRow props with a fake injected face over one fixed snapshot. */
function makeGlassRow(state: {
  enabled: boolean
  mode: 'mica' | 'compat'
  blur: number
  frost: number
  brightness: number
  dark: boolean
}) {
  return {
    t,
    getState: () => state,
    subscribe: () => () => {},
    setEnabled: vi.fn(),
    setMode: vi.fn(),
    setBlur: vi.fn(),
    setFrost: vi.fn(),
    setBrightness: vi.fn(),
    resetDefaults: vi.fn(),
  } as unknown as GlassRowProps
}

/** The preset group's cells, in display order. */
function presetCells(): HTMLButtonElement[] {
  const group = screen.getByRole('group', { name: t('glass.presets') })
  return [...group.querySelectorAll('button')] as HTMLButtonElement[]
}

describe('UpdateRow auto-retry (audit F6)', () => {
  it('re-reads the CURRENT channel when the 30s retry fires', async () => {
    // The check used the render-closure's channel, so switching the channel
    // after a failure made the single auto-retry query the CHANNEL IT LEFT.
    vi.useFakeTimers()
    try {
      let channelNow: UpdateChannel = 'latest'
      const calls: UpdateChannel[] = []
      const props = {
        t,
        check: async (channel: UpdateChannel) => {
          calls.push(channel)
          return { ok: false, code: 'network.upstream', error: 'timed out' }
        },
        autoCheck: () => false,
        setAutoCheck: vi.fn(),
        channel: () => channelNow,
        setChannel: vi.fn(),
        subscribePrefs: () => () => {},
        lastAutoResult: () => null,
        subscribeConflict: () => () => {},
        conflictCount: () => 0,
        activeLocale: () => 'en',
        subscribeLocale: () => () => {},
      } as unknown as UpdateRowProps
      render(<UpdateRow {...props} />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: t('update.check') }))
      })
      expect(calls).toEqual(['latest'])

      channelNow = 'beta' // the user switches while the retry is still pending
      await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_RETRY_AFTER_MS) })
      expect(calls).toEqual(['latest', 'beta'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GlassRow presets tab stop (audit F3)', () => {
  // `value` is the active preset id, or '' when the knobs are hand-tuned. The
  // roving tabindex anchored on it, so a custom combination left EVERY cell at
  // -1 and the group dropped out of the tab order entirely.
  it('keeps exactly one tab stop when the knobs match no preset', () => {
    render(<GlassRow {...makeGlassRow({ enabled: true, mode: 'mica', blur: 7, frost: 33, brightness: 50, dark: true })} />)
    const cells = presetCells()
    expect(cells).toHaveLength(3)
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1)
    expect(cells[0]?.tabIndex).toBe(0) // the first cell is the fallback anchor
  })

  it('anchors on the matching preset when there is one', () => {
    // blur 2 / frost 20 / brightness 50 === the shipped "standard" preset.
    render(<GlassRow {...makeGlassRow({ enabled: true, mode: 'mica', blur: 2, frost: 20, brightness: 50, dark: true })} />)
    const cells = presetCells()
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1)
    expect(cells[1]?.tabIndex).toBe(0)
  })
})

describe('GlassRow knobs', () => {
  it('announces each slider with its unit (item Z)', () => {
    // The snapshot object must keep a stable identity: `useSyncExternalStore`
    // compares by reference and would re-render forever on a fresh object
    // (the same contract the real face honours via `overridesSnapshot`).
    const state = { enabled: true, mode: 'mica' as const, blur: 14, frost: 20, brightness: 30, dark: true }
    const props = {
      t,
      getState: () => state,
      subscribe: () => () => {},
      setEnabled: vi.fn(),
      setMode: vi.fn(),
      setBlur: vi.fn(),
      setFrost: vi.fn(),
      setBrightness: vi.fn(),
      resetDefaults: vi.fn(),
    } as unknown as GlassRowProps
    render(<GlassRow {...props} />)

    // The qualitative tier names stay out of the dictionaries on purpose, so
    // the contract is value+unit, not a phrase.
    const ranges = screen.getAllByRole('slider')
    expect(ranges.map((range) => range.getAttribute('aria-valuetext'))).toEqual(['14px', '20%', '30%'])
  })
})
