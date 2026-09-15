// @vitest-environment jsdom
/**
 * Settings-row component coverage — the harness the rows never had.
 *
 * Until now the client rows were covered by pure-logic tests plus screenshot
 * review, so interaction-level defects had no guard: item TT (per-keystroke
 * commits unmounting the row you are typing into) was found by reading code,
 * and XX is still open. Both rows take every dependency as a prop (no module
 * globals), so a fake injected face is enough to render them.
 *
 * `cleanup` is explicit because this repo runs vitest without `globals`, so
 * Testing Library cannot register its own afterEach hook.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CatppuccinRow, type CatppuccinRowProps } from '../src/client/CatppuccinRow.tsx'
import { GlassRow, type GlassRowProps } from '../src/client/glass/glass-row.tsx'
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
