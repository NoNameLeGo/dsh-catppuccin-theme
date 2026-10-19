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
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CatppuccinRow, type CatppuccinRowProps } from '../src/client/CatppuccinRow.tsx'
import { CatppuccinDetailCard, type CatppuccinDetailCardProps } from '../src/client/detail-card.tsx'
import { GlassRow, type GlassRowProps } from '../src/client/glass/glass-row.tsx'
import { CatppuccinSettingsPage, type CatppuccinSettingsPageProps } from '../src/client/settings-section.tsx'
import { ISSUES_URL, LinksRow, REPO_URL, type LinksRowProps } from '../src/client/LinksRow.tsx'
import { UPDATE_RETRY_AFTER_MS, UpdateRow, type UpdateRowProps } from '../src/client/UpdateRow.tsx'
import type { UpdateChannel } from '../src/update-check.ts'
import { zh, type CatppuccinKey } from '../src/client/locales.ts'
import type { ShikiStyle } from '../src/state.ts'

afterEach(cleanup)

/** The row stylesheet as TEXT: class names are hashed at build time, so the
 *  only stable way to assert on a rule is to read the source (same technique as
 *  tests/glass-css.spec.ts). Resolved to a string path on purpose — jsdom's
 *  `URL` is not the Node one, and readFileSync rejects it. */
const ROW_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client', 'CatppuccinRow.module.css'),
  'utf8',
)

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

describe('CatppuccinRow code sample (2026-10-19)', () => {
  // The shiki pick only shows up inside code blocks, which the settings page
  // does not have — the sample is the in-place target, so it must paint from the
  // SAME token variables the real blocks read. `italic-comments` is a comment
  // COLOUR step (overlay2 → subtext0), so the comment line is the only line the
  // pick can visibly change; the colour must therefore arrive through CSS, not
  // through a prop, or the sample would be a mock.
  it('renders a sample with a comment line', () => {
    const { props } = makeRow()
    render(<CatppuccinRow {...props} />)

    const sample = screen.getByLabelText(t('row.previewCode'))
    const lines = [...sample.querySelectorAll('span')].map((span) => span.textContent)
    expect(lines).toContain('// a comment')
    expect(lines).toContain('const')
  })

  it('paints every token from the live shiki variables, never a hardcoded colour', () => {
    // Locked on the stylesheet text because the class names are hashed per
    // build: this is the contract that survives a recompile.
    const rules = [...ROW_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(tok[A-Za-z]+)\s*\{([^}]*)\}/g)]
    expect(rules.length, 'the sample token rules disappeared').toBeGreaterThan(0)
    for (const [, name, decls] of rules) {
      expect(decls, `.${name} must read a --shiki-token-* variable`).toMatch(
        /var\(--shiki-token-[a-z-]+,\s*var\(/,
      )
      expect(decls, `.${name} must not hardcode a colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
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

/**
 * Copy selection by host kind (2026-10-03). The official Electron shell has no
 * CLI path a user can reach — its env carries no community marker and it
 * registers no `desktopProfiles` service, so the Host classifies it as
 * `official-desktop` and sends `updateSpec` (`pkg@tag`) INSTEAD of
 * `updateCommand`. The row must then show the Plugins-page route (delete →
 * re-add) rather than a command nobody there can run.
 */
describe('UpdateRow copy by host kind', () => {
  function propsFor(payload: Record<string, unknown>) {
    return {
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
      activeLocale: () => 'zh',
      subscribeLocale: () => () => {},
    } as unknown as UpdateRowProps
  }

  const base = {
    ok: true,
    current: '0.5.9',
    latest: '0.5.10-beta.0',
    outdated: true,
    channel: 'beta',
    profile: 'desktop',
    profileDetected: true,
    installSource: 'registry',
    code: 'ok',
  } as const

  it('offers the package spec + Plugins-page route on the official shell, never a CLI command', async () => {
    render(<UpdateRow {...propsFor({
      ...base,
      shell: 'official-desktop',
      env: 'desktop',
      updateSpec: '@nonamelego/dsh-catppuccin@beta',
    })} />)
    fireEvent.click(screen.getByRole('button', { name: t('update.check') }))
    await waitFor(() => { expect(screen.getByText('@nonamelego/dsh-catppuccin@beta')).toBeDefined() })
    expect(screen.getByText(t('update.commandHintOfficialDesktop'))).toBeDefined()
    // The copy button names what it actually copies.
    expect(screen.getByRole('button', { name: t('update.copySpec') })).toBeDefined()
    expect(screen.queryByRole('button', { name: t('update.copy') })).toBeNull()
    // No CLI shape may leak into a shell where nobody can run it.
    expect(screen.queryByText(/dsh plugin --profile/u)).toBeNull()
  })

  it('keeps the CLI command on the community shell (it has an in-app terminal)', async () => {
    const command = 'dsh plugin --profile desktop add @nonamelego/dsh-catppuccin@beta'
    render(<UpdateRow {...propsFor({
      ...base,
      shell: 'community-desktop',
      env: 'desktop',
      updateCommand: command,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: t('update.check') }))
    await waitFor(() => { expect(screen.getByText(command)).toBeDefined() })
    // The hint interpolates the probed profile, so assert on the interpolated text.
    expect(screen.getByText(t('update.commandHintDesktop').replace('{profile}', 'desktop'))).toBeDefined()
    expect(screen.getByRole('button', { name: t('update.copy') })).toBeDefined()
  })

  it('keeps the terminal hint on plain web', async () => {
    render(<UpdateRow {...propsFor({
      ...base,
      shell: 'web',
      env: 'web',
      profile: 'web',
      updateCommand: 'dsh plugin --profile web add @nonamelego/dsh-catppuccin@beta',
    })} />)
    fireEvent.click(screen.getByRole('button', { name: t('update.check') }))
    await waitFor(() => { expect(screen.getByText(t('update.commandHintDetected').replace('{profile}', 'web'))).toBeDefined() })
    expect(screen.getByRole('button', { name: t('update.copy') })).toBeDefined()
  })
})

/** GlassRow props with a fake injected face over one fixed snapshot. */
function makeGlassRow(state: {
  enabled: boolean
  mode: 'mica' | 'compat'
  blur: number
  frost: number
  brightness: number
  /** Issue #26 ground-glow switch. */
  glow?: boolean
  dark: boolean
}) {
  // The glow switch is issue #26's; an unset state renders as OFF (the shipped
  // default), which also keeps every older call site above valid. The object is
  // hoisted ON PURPOSE: `useSyncExternalStore` needs a cached snapshot, and a
  // fresh object per call is an infinite re-render ("getSnapshot should be
  // cached") — every GlassRow test in this file breaks if this moves back inline.
  const snapshot = { glow: false, ...state }
  return {
    t,
    getState: () => snapshot,
    subscribe: () => () => {},
    setEnabled: vi.fn(),
    setMode: vi.fn(),
    setBlur: vi.fn(),
    setFrost: vi.fn(),
    setBrightness: vi.fn(),
    setGlow: vi.fn(),
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

describe('GlassRow presets (issue #27)', () => {
  // The group used to be a hand-rolled roving-tabindex segmented control whose
  // anchor fell to -1 when the knobs matched no preset (audit F3). Issue #27
  // replaced it with official Button atoms: every cell is a native tab stop, so
  // the group can never drop out of the tab order, and the active preset is
  // announced with aria-pressed instead of position.
  it('leaves every preset reachable when the knobs match no preset', () => {
    render(<GlassRow {...makeGlassRow({ enabled: true, mode: 'mica', blur: 7, frost: 33, brightness: 50, dark: true })} />)
    const cells = presetCells()
    expect(cells).toHaveLength(3)
    expect(cells.every((cell) => cell.tabIndex === 0)).toBe(true)
    expect(cells.filter((cell) => cell.getAttribute('aria-pressed') === 'true')).toHaveLength(0)
  })

  it('marks the matching preset as pressed', () => {
    // blur 5 / frost 20 / brightness 50 === the shipped "standard" preset.
    render(<GlassRow {...makeGlassRow({ enabled: true, mode: 'mica', blur: 5, frost: 20, brightness: 50, dark: true })} />)
    const cells = presetCells()
    expect(cells.filter((cell) => cell.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(cells[1]?.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('GlassRow ground-glow switch (issue #26)', () => {
  it('renders OFF by default and writes through on click', () => {
    const props = makeGlassRow({ enabled: true, mode: 'mica', blur: 5, frost: 20, brightness: 50, dark: true })
    render(<GlassRow {...props} />)
    const toggle = screen.getByRole('switch', { name: t('glass.glow') })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect((props as unknown as { setGlow: (value: boolean) => void }).setGlow).toHaveBeenCalledWith(true)
  })

  it('renders ON when the state says so', () => {
    render(<GlassRow {...makeGlassRow({ enabled: true, mode: 'mica', blur: 5, frost: 20, brightness: 50, glow: true, dark: true })} />)
    expect(screen.getByRole('switch', { name: t('glass.glow') }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('GlassRow ground sample (2026-10-19)', () => {
  // Brightness and the glow switch move the PAGE ground, which the settings
  // page covers with its own fill — the strip is the only in-place target.
  it('renders the strip, hooked to the ground rule, while the layer is on', () => {
    const { container } = render(
      <GlassRow {...makeGlassRow({ enabled: true, mode: 'mica', blur: 5, frost: 20, brightness: 50, dark: true })} />,
    )
    const strip = container.ownerDocument.querySelector('[data-dsh-glass-ground-sample]')
    expect(strip, 'brightness / glow lost their preview target').not.toBeNull()
    expect(screen.getByText(t('glass.previewGround'))).toBeDefined()
  })

  it('does not render it while the layer is off', () => {
    const { container } = render(
      <GlassRow {...makeGlassRow({ enabled: false, mode: 'mica', blur: 5, frost: 20, brightness: 50, dark: true })} />,
    )
    expect(container.ownerDocument.querySelector('[data-dsh-glass-ground-sample]')).toBeNull()
  })
})

describe('GlassRow mode preview (2026-10-19)', () => {
  // mica and compat restyle the header, sidebar, composer and bubbles — none of
  // which are on this page, so the picker cannot show its own result. The row
  // offers the shell's `close` instead of drawing a thumbnail that could go
  // stale (the approach the improvement list already rejected).
  const state = { enabled: true, mode: 'mica' as const, blur: 5, frost: 20, brightness: 50, dark: true }

  it('offers the way out where the settings surface can be closed', () => {
    const onPreviewMain = vi.fn()
    render(<GlassRow {...makeGlassRow(state)} onPreviewMain={onPreviewMain} />)
    fireEvent.click(screen.getByRole('button', { name: t('glass.previewMode') }))
    expect(onPreviewMain).toHaveBeenCalledTimes(1)
  })

  it('does not offer it where there is nothing to close (plugin detail card)', () => {
    render(<GlassRow {...makeGlassRow(state)} />)
    expect(screen.queryByRole('button', { name: t('glass.previewMode') })).toBeNull()
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

describe('GlassRow knob value box (issue #27)', () => {
  /** Mount the row and return the blur box plus the injected writer spies. */
  function mountKnob(value = 14) {
    const props = makeGlassRow({ enabled: true, mode: 'mica', blur: value, frost: 20, brightness: 30, dark: true })
    render(<GlassRow {...props} />)
    return { props, box: screen.getByRole('textbox', { name: t('glass.blur') }) }
  }

  it('does not write while the user is still typing', () => {
    const { props, box } = mountKnob()
    fireEvent.change(box, { target: { value: '22' } })
    expect(props.setBlur).not.toHaveBeenCalled()
  })

  it('commits the typed value on Enter and clamps it to the axis', () => {
    const { props, box } = mountKnob()
    fireEvent.change(box, { target: { value: '99' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.setBlur).toHaveBeenCalledWith(40)
  })

  it('commits on blur and snaps to the 0.5 step', () => {
    const { props, box } = mountKnob()
    fireEvent.change(box, { target: { value: '7.3' } })
    fireEvent.blur(box)
    expect(props.setBlur).toHaveBeenCalledWith(7.5)
  })

  it('drops garbage and Escape drafts without writing', () => {
    const { props, box } = mountKnob()
    fireEvent.change(box, { target: { value: 'abc' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.setBlur).not.toHaveBeenCalled()

    fireEvent.change(box, { target: { value: '12' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(props.setBlur).not.toHaveBeenCalled()
    expect((box as HTMLInputElement).value).toBe('14')
  })

  it('steps by the axis step with the arrow keys', () => {
    const { props, box } = mountKnob()
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    expect(props.setBlur).toHaveBeenLastCalledWith(14.5)
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(props.setBlur).toHaveBeenLastCalledWith(13.5)
  })
})

/**
 * The Plugins-page card is a composition, not a fourth UI: it stacks the
 * existing rows so the plugin's own detail page offers the same knobs as the
 * General section. These tests pin that composition (a swap of any child would
 * silently change what the page shows) and that each row keeps its own
 * affordances — including the ones the schema form could never render.
 */
describe('CatppuccinDetailCard (Plugins-page card)', () => {
  /** The three injected faces the apply-side factories hand the card,
   *  minimally faked — the feedback row carries no face of its own. */
  function makeCardProps() {
    return {
      t,
      flavor: makeRow().props,
      glass: makeGlassRow({ enabled: true, mode: 'mica', blur: 5, frost: 20, brightness: 50, dark: true }),
      update: {
        t,
        check: async () => null,
        autoCheck: () => false,
        setAutoCheck: vi.fn(),
        channel: () => 'latest',
        setChannel: vi.fn(),
        subscribePrefs: () => () => {},
        lastAutoResult: () => null,
        subscribeConflict: () => () => {},
        conflictCount: () => 0,
        activeLocale: () => 'zh-CN',
        subscribeLocale: () => () => {},
      },
    } as unknown as CatppuccinDetailCardProps
  }

  it('stacks the flavour, glass, update and feedback rows', () => {
    const { container } = render(<CatppuccinDetailCard {...makeCardProps()} />)
    expect(container.querySelector('[data-catppuccin-detail-card]')).not.toBeNull()
    const text = container.textContent ?? ''
    expect(text).toContain(t('row.title'))
    expect(text).toContain(t('glass.title'))
    expect(text).toContain(t('update.title'))
    expect(text).toContain(t('links.title'))
  })

  it('keeps the affordances a schema-generated form could not render', () => {
    render(<CatppuccinDetailCard {...makeCardProps()} />)
    // One flavour button per theme plus the follow-system choice.
    expect(screen.getAllByRole('button', { name: /Mocha|跟随系统/ }).length).toBeGreaterThan(0)
    // The glass presets and the update-check action travel with the rows.
    expect(screen.getByRole('group', { name: t('glass.presets') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('update.check') })).toBeTruthy()
    // The feedback row's two GitHub links render on the detail page too.
    expect(screen.getByRole('link', { name: t('links.issue') })).toBeTruthy()
    expect(screen.getByRole('link', { name: t('links.star') })).toBeTruthy()
  })
})

/**
 * The feedback row: pure copy plus two static URLs, no injected face. The
 * contracts worth pinning are the hrefs (a typo'd repo URL would ship
 * silently — nothing type-checks a string against GitHub) and
 * `target="_blank"` (without it the click navigates the DSH UI itself away).
 */
describe('LinksRow (feedback & support)', () => {
  const props = { t } as unknown as LinksRowProps

  it('lists both GitHub links with the right targets', () => {
    render(<LinksRow {...props} />)
    const issue = screen.getByRole('link', { name: t('links.issue') })
    const star = screen.getByRole('link', { name: t('links.star') })
    expect(issue.getAttribute('href')).toBe(ISSUES_URL)
    expect(star.getAttribute('href')).toBe(REPO_URL)
    expect(ISSUES_URL).toBe(`${REPO_URL}/issues`)
  })

  it('opens both links in a new tab so the app is never navigated away', () => {
    render(<LinksRow {...props} />)
    for (const link of [
      screen.getByRole('link', { name: t('links.issue') }),
      screen.getByRole('link', { name: t('links.star') }),
    ]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    }
  })
})

/**
 * The settings page (issue #27) is a composition, not a fifth implementation:
 * it adds the page heading on top of the very rows the detail card stacks. The
 * tests pin both facts — the heading copy and the row order — because a
 * reordering here silently changes what the Settings nav entry opens.
 */
describe('settings page (issue #27)', () => {
  function makePageProps() {
    return {
      t,
      close: () => {},
      flavor: makeRow().props,
      glass: makeGlassRow({ enabled: true, mode: 'mica', blur: 5, frost: 20, brightness: 50, dark: true }),
      update: {
        t,
        check: async () => null,
        autoCheck: () => false,
        setAutoCheck: vi.fn(),
        channel: () => 'latest',
        setChannel: vi.fn(),
        subscribePrefs: () => () => {},
        lastAutoResult: () => null,
        subscribeConflict: () => () => {},
        conflictCount: () => 0,
        activeLocale: () => 'zh-CN',
        subscribeLocale: () => () => {},
      },
    } as unknown as CatppuccinSettingsPageProps
  }

  it('renders the page heading and the four rows in order', () => {
    const { container } = render(<CatppuccinSettingsPage {...makePageProps()} />)
    expect(container.querySelector('[data-catppuccin-settings]')).not.toBeNull()
    expect(container.querySelector('h2')?.textContent).toBe(t('page.title'))
    const rows = [...container.querySelectorAll('[data-catppuccin-row]')]
      .map((row) => row.getAttribute('data-catppuccin-row'))
    expect(rows).toEqual(['flavor', 'glass', 'update', 'links'])
  })

  it('hands the shell close to the mode preview button', () => {
    const close = vi.fn()
    render(<CatppuccinSettingsPage {...makePageProps()} close={close} />)
    fireEvent.click(screen.getByRole('button', { name: t('glass.previewMode') }))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
