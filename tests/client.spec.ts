// @vitest-environment jsdom
/**
 * Client-side pure logic: flavour choice read/write fallbacks, the
 * built-in-preference restore pair (the "off restores what you had" fix),
 * and the settings-scope adapter (bind/read/persist + debounced writer).
 * The host-side mirror of the contract lives in the other specs; this file
 * only covers what the browser half owns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FLAVOR_STORAGE_KEY,
  RESTORE_STORAGE_KEY,
  builtinPickWins,
  flavorFromThemeId,
  flavorInfo,
  readFlavor,
  readRestoredPreference,
  rememberBuiltinPreference,
  writeFlavor,
} from '../src/client/index.ts'
import {
  cancelDurablePersist,
  durableStateFromSnapshot,
  isScopeUsable,
  persistStateToScope,
  scheduleDurablePersist,
  type SettingsScope,
  type SettingsScopeSnapshot,
} from '../src/client/state-sync.ts'
import { STATE_VERSION, defaultSettingsSection, defaultState, settingsSectionFromState } from '../src/state.ts'
import type { CatppuccinSettingsSection } from '../src/state.ts'

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
afterEach(() => cancelDurablePersist())

describe('flavour choice', () => {
  it('maps registered theme ids to themselves and everything else to off', () => {
    expect(flavorFromThemeId('catppuccin-mocha')).toBe('catppuccin-mocha')
    expect(flavorFromThemeId('catppuccin-latte')).toBe('catppuccin-latte')
    expect(flavorFromThemeId('system')).toBe('off')
    expect(flavorFromThemeId('dark')).toBe('off')
    expect(flavorFromThemeId('')).toBe('off')
  })

  it('flavorInfo returns the registered entry only', () => {
    expect(flavorInfo('catppuccin-mocha')?.themeId).toBe('catppuccin-mocha')
    expect(flavorInfo('dark')).toBeUndefined()
  })

  it('reads back a persisted flavour; absent or unknown values mean off', () => {
    expect(readFlavor()).toBe('off')
    writeFlavor('catppuccin-frappe')
    expect(readFlavor()).toBe('catppuccin-frappe')
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'not-a-flavour')
    expect(readFlavor()).toBe('off')
  })
})

describe('built-in preference restore', () => {
  it('remembers built-in preferences and ignores Catppuccin ones', () => {
    rememberBuiltinPreference('light')
    expect(localStorage.getItem(RESTORE_STORAGE_KEY)).toBe('light')
    // A flavour observation must not clobber the recorded built-in choice.
    rememberBuiltinPreference('catppuccin-mocha')
    expect(localStorage.getItem(RESTORE_STORAGE_KEY)).toBe('light')
    rememberBuiltinPreference('system')
    expect(localStorage.getItem(RESTORE_STORAGE_KEY)).toBe('system')
  })

  it('restores only a recorded light/dark, otherwise system', () => {
    expect(readRestoredPreference()).toBe('system')
    localStorage.setItem(RESTORE_STORAGE_KEY, 'dark')
    expect(readRestoredPreference()).toBe('dark')
    localStorage.setItem(RESTORE_STORAGE_KEY, 'junk')
    expect(readRestoredPreference()).toBe('system')
  })
})

describe('builtinPickWins (issue #6 restore guard)', () => {
  it('never lets "system" win over the persisted flavour', () => {
    expect(builtinPickWins('system', null)).toBe(false)
    expect(builtinPickWins('system', 'system')).toBe(false)
    expect(builtinPickWins('system', 'light')).toBe(false)
  })

  it('lets light/dark win only when explicitly picked this session', () => {
    expect(builtinPickWins('light', 'light')).toBe(true)
    expect(builtinPickWins('dark', 'dark')).toBe(true)
    // Boot/adopt-acquired values (no live pick recorded) never win — the
    // settings document's persisted light/dark must not bury the flavour.
    expect(builtinPickWins('light', null)).toBe(false)
    expect(builtinPickWins('dark', null)).toBe(false)
    // A live pick of the OTHER built-in value is not this preference.
    expect(builtinPickWins('light', 'dark')).toBe(false)
    expect(builtinPickWins('dark', 'light')).toBe(false)
  })

  it('non built-in preferences (flavour ids) never win', () => {
    expect(builtinPickWins('catppuccin-latte', 'catppuccin-latte')).toBe(false)
    expect(builtinPickWins('catppuccin-mocha', null)).toBe(false)
  })
})

/** Build a settings-scope snapshot fixture (host-mode, resolved). */
function hostSnapshot(value: CatppuccinSettingsSection, user?: unknown): SettingsScopeSnapshot<CatppuccinSettingsSection> {
  return {
    status: 'ready',
    value,
    base: defaultSettingsSection(),
    user,
    revision: 1,
    writable: true,
    mode: 'host',
  }
}

/** Minimal scope double recording mutations. */
function scopeDouble(options: {
  snapshot?: SettingsScopeSnapshot<CatppuccinSettingsSection>
  mutate?: () => Promise<void>
} = {}): { scope: SettingsScope<CatppuccinSettingsSection>; mutations: unknown[][] } {
  const mutations: unknown[][] = []
  return {
    mutations,
    scope: {
      getSnapshot() { return options.snapshot ?? hostSnapshot(defaultSettingsSection()) },
      subscribe() { return () => {} },
      set() { return Promise.resolve() },
      unset() { return Promise.resolve() },
      mutate(ops) {
        mutations.push(ops as never)
        return options.mutate !== undefined ? options.mutate() : Promise.resolve()
      },
    } as unknown as SettingsScope<CatppuccinSettingsSection>,
  }
}

describe('isScopeUsable', () => {
  it('accepts only a resolved host-mode snapshot', () => {
    expect(isScopeUsable(hostSnapshot(defaultSettingsSection()))).toBe(true)
    expect(isScopeUsable({ ...hostSnapshot(defaultSettingsSection()), mode: 'memory' })).toBe(false)
    expect(isScopeUsable({ ...hostSnapshot(defaultSettingsSection()), status: 'loading' })).toBe(false)
    expect(isScopeUsable({ ...hostSnapshot(defaultSettingsSection()), status: 'unavailable' })).toBe(false)
  })
})

describe('durableStateFromSnapshot', () => {
  it('returns null unless the scope is usable and resolved', () => {
    expect(durableStateFromSnapshot({ ...hostSnapshot(defaultSettingsSection()), status: 'loading' })).toBeNull()
    expect(durableStateFromSnapshot({ ...hostSnapshot(undefined as never), status: 'unavailable' })).toBeNull()
    expect(durableStateFromSnapshot({ ...hostSnapshot(defaultSettingsSection()), mode: 'memory' })).toBeNull()
  })

  it('lifts a resolved section into the full state contract (re-sanitized)', () => {
    const snapshot = hostSnapshot(settingsSectionFromState(
      defaultState(),
    ), undefined)
    const state = durableStateFromSnapshot(snapshot)
    expect(state?.version).toBe(STATE_VERSION)
    expect(state?.flavor).toBe('off')
  })
})

describe('persistStateToScope', () => {
  it('writes one atomic mutation covering the whole section', async () => {
    const { scope, mutations } = scopeDouble()
    const state = { ...defaultState(), flavor: 'catppuccin-latte' as never, glass: { ...defaultState().glass, blur: 77 } }
    expect(await persistStateToScope(scope, state)).toBe('written')
    expect(mutations).toHaveLength(1)
    const ops = mutations[0] as { op: string; path: string[]; value: unknown }[]
    const byPath = Object.fromEntries(ops.map((op) => [op.path.join('.'), op.value]))
    expect(byPath['flavor']).toBe('catppuccin-latte')
    expect(byPath['glass.blur']).toBe(77)
    expect(byPath['glass.enabled']).toBe(false)
    expect(byPath['autoCheck']).toBe(true)
    expect(byPath['updateChannel']).toBe('latest')
    expect(byPath['overrides']).toEqual({})
    expect(byPath['shikiStyle']).toBe('default')
  })

  it('reports error when the write rejects', async () => {
    const local = { ...defaultState(), flavor: 'catppuccin-mocha' as never }
    const flaky = {
      getSnapshot() { return hostSnapshot(defaultSettingsSection()) },
      mutate() { return Promise.reject(new Error('conflict')) },
    } as unknown as SettingsScope<CatppuccinSettingsSection>
    expect(await persistStateToScope(flaky, local)).toBe('error')
  })

  it('is a noop when the local state already equals the document', async () => {
    const local = { ...defaultState(), flavor: 'catppuccin-mocha' as never }
    const { scope, mutations } = scopeDouble({ snapshot: hostSnapshot(settingsSectionFromState(local)) })
    expect(await persistStateToScope(scope, local)).toBe('noop')
    expect(mutations).toHaveLength(0)
  })

  it('writes when the base revision matches the snapshot (no remote movement)', async () => {
    const { scope, mutations } = scopeDouble({ snapshot: { ...hostSnapshot(defaultSettingsSection()), revision: 7 } })
    const state = { ...defaultState(), flavor: 'catppuccin-mocha' as never }
    expect(await persistStateToScope(scope, state, { baseRevision: 7 })).toBe('written')
    expect(mutations).toHaveLength(1)
  })

  it('abandons a stale write-back when the document moved past the base revision (item C/X)', async () => {
    // Tab B committed a newer document: the snapshot revision moved from the
    // base (3) our local state was derived from to 4, and the remote section
    // is NOT our own last-written echo — the local write would clobber it.
    const remote = settingsSectionFromState({ ...defaultState(), flavor: 'catppuccin-mocha' as never })
    const { scope, mutations } = scopeDouble({
      snapshot: { ...hostSnapshot(remote), revision: 4 },
    })
    const state = { ...defaultState(), flavor: 'catppuccin-latte' as never }
    const outcome = await persistStateToScope(scope, state, { baseRevision: 3 })
    expect(outcome).toBe('stale')
    expect(mutations).toHaveLength(0)
  })

  it('still writes when the revision moved but the remote equals our own last write (echo)', async () => {
    // Our own just-committed write folded back into the mirror: remote is
    // the very section we wrote last, so the movement is not a conflict.
    const ours = settingsSectionFromState({ ...defaultState(), flavor: 'catppuccin-latte' as never })
    const { scope, mutations } = scopeDouble({
      snapshot: { ...hostSnapshot(ours), revision: 4 },
    })
    const state = { ...defaultState(), flavor: 'catppuccin-mocha' as never }
    const outcome = await persistStateToScope(scope, state, { baseRevision: 3, lastWrittenSection: ours })
    expect(outcome).toBe('written')
    expect(mutations).toHaveLength(1)
  })

  it('reports error for a not-ready or memory-mode snapshot', async () => {
    const flaky = {
      getSnapshot() { return { ...hostSnapshot(defaultSettingsSection()), status: 'loading' as const } },
      mutate() { return Promise.resolve() },
    } as unknown as SettingsScope<CatppuccinSettingsSection>
    expect(await persistStateToScope(flaky, defaultState())).toBe('error')
  })
})

describe('scheduleDurablePersist debounce', () => {
  it('coalesces a burst into one flush of the freshest write', async () => {
    vi.useFakeTimers()
    const writes: string[] = []
    let value = 'catppuccin-latte'
    scheduleDurablePersist(() => { writes.push(value) }, 300)
    value = 'catppuccin-mocha'
    scheduleDurablePersist(() => { writes.push(value) }, 300)
    await vi.advanceTimersByTimeAsync(299)
    expect(writes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(writes).toEqual(['catppuccin-mocha'])
  })

  it('cancelDurablePersist drops the queued write', async () => {
    vi.useFakeTimers()
    const writes: string[] = []
    scheduleDurablePersist(() => { writes.push('x') }, 300)
    cancelDurablePersist()
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toHaveLength(0)
  })
})
