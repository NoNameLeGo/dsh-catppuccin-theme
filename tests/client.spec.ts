// @vitest-environment jsdom
/**
 * Client-side pure logic: flavour choice read/write fallbacks, the
 * built-in-preference restore pair (the "off restores what you had" fix),
 * and the durable state-sync wrappers (fetch contract + debounced writer).
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
  persistDurableState,
  readDurableStateRemote,
  scheduleDurablePersist,
} from '../src/client/state-sync.ts'
import { STATE_ROUTE_PATH, defaultState } from '../src/state.ts'

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

/** Minimal fetch stub shape used by state-sync. */
function stubFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>): void {
  vi.stubGlobal('fetch', vi.fn(impl) as unknown as typeof fetch)
}

describe('readDurableStateRemote', () => {
  it('answers unavailable on any fetch failure or non-ok response', async () => {
    stubFetch(async () => { throw new Error('no route') })
    expect(await readDurableStateRemote()).toEqual({ available: false, state: null })
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    expect(await readDurableStateRemote()).toEqual({ available: false, state: null })
  })

  it('sanitizes the payload and maps null state through', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ ok: true, state: null }) }))
    expect(await readDurableStateRemote()).toEqual({ available: true, state: null })
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ ok: true, state: { flavor: 'catppuccin-mocha', glass: { enabled: true, blur: 999 } } }),
    }))
    const result = await readDurableStateRemote()
    expect(result.available).toBe(true)
    expect(result.state?.flavor).toBe('catppuccin-mocha')
    expect(result.state?.glass.blur).toBe(40) // clamped by sanitizeState
    expect(result.state?.glass.frost).toBe(defaultState().glass.frost) // defaulted
  })
})

describe('persistDurableState', () => {
  it('PUTs the sanitized state and reports the response verdict', async () => {
    const seen: { url: string; init?: RequestInit }[] = []
    stubFetch(async (url, init) => { seen.push({ url, init }); return { ok: true } })
    expect(await persistDurableState({ ...defaultState(), flavor: 'catppuccin-latte', glass: { ...defaultState().glass, blur: 77 } } as never)).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe(STATE_ROUTE_PATH)
    expect(seen[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(seen[0].init?.body)).glass.blur).toBe(40) // sanitized before the wire
    stubFetch(async () => { throw new Error('gone') })
    expect(await persistDurableState(defaultState())).toBe(false)
  })
})

describe('scheduleDurablePersist debounce', () => {
  it('coalesces a burst into one PUT of the freshest state', async () => {
    const put = vi.fn(async () => ({ ok: true }))
    stubFetch(put as unknown as typeof fetch)
    vi.useFakeTimers()
    let value = 'catppuccin-latte'
    scheduleDurablePersist(() => ({ ...defaultState(), flavor: value as never }), 300)
    value = 'catppuccin-mocha'
    scheduleDurablePersist(() => ({ ...defaultState(), flavor: value as never }), 300)
    await vi.advanceTimersByTimeAsync(299)
    expect(put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(put.mock.calls[0][1]?.body)).flavor).toBe('catppuccin-mocha')
  })

  it('cancelDurablePersist drops the queued write', async () => {
    const put = vi.fn(async () => ({ ok: true }))
    stubFetch(put as unknown as typeof fetch)
    vi.useFakeTimers()
    scheduleDurablePersist(() => defaultState(), 300)
    cancelDurablePersist()
    await vi.advanceTimersByTimeAsync(1000)
    expect(put).not.toHaveBeenCalled()
  })
})
