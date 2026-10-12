// @vitest-environment jsdom
/**
 * Issue #23 regression: a registration collision must degrade to a SKIP, never
 * fail the client entry.
 *
 * Why this matters end-to-end: an entry whose `apply()` throws is marked
 * `failed`, the web boot assembly aborts with `web boot: N entries did not
 * activate`, and the official desktop's crash rescue then disables EVERY
 * third-party plugin. The realistic trigger is a peer language pack
 * (dsh-locale-pack, …) already owning a BCP 47 id — `addLanguage` throws
 * `locale "ja" is already registered` — and the same shape exists for the
 * theme registry, the slot registry and the host route table (a duplicate
 * install). All of them ride `tolerantRegistration` (see
 * `src/registration-tolerance.ts` and `docs/issue-23-registration-tolerance.md`).
 *
 * Mutation check (this repo's convention): make `tolerantRegistration` call
 * `run()` bare (drop the catch) and every case here turns red — the locale
 * cases fail `apply()` itself, the theme case fails on the uncaught deferred
 * restore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, FLAVOR_STORAGE_KEY } from '../src/client/index.ts'
import { tolerantRegistration } from '../src/registration-tolerance.ts'

/** Minimal ThemeRuntime double: only what apply() touches at mount time. */
function makeTheme() {
  const themes: { id: string; colorScheme: string; tokens: Record<string, unknown> }[] = [
    { id: 'light', colorScheme: 'light', tokens: {} },
    { id: 'dark', colorScheme: 'dark', tokens: {} },
  ]
  return {
    themes,
    preference: 'system' as string,
    revision: 0,
    getTheme() {
      return {
        preference: this.preference,
        revision: this.revision,
        active: { colorScheme: this.preference === 'light' ? 'light' : 'dark' },
      }
    },
    setTheme(id: string) {
      if (id !== 'system' && !themes.some((t) => t.id === id)) throw new Error(`theme "${id}" is not registered`)
      this.preference = id
      this.revision += 1
    },
    register(def: { id: string; colorScheme: string; tokens: Record<string, unknown> }) {
      if (themes.some((t) => t.id === def.id)) throw new Error(`theme "${def.id}" is already registered`)
      themes.push(def)
      this.revision += 1
      return () => {
        const index = themes.findIndex((t) => t.id === def.id)
        if (index >= 0) themes.splice(index, 1)
      }
    },
  }
}

/** Locale double that records every ATTEMPT, so a skip is still visible. */
function makeLocale(options: { collision?: boolean; explode?: boolean } = {}) {
  const attempts: { kind: 'register' | 'addLanguage'; id: string }[] = []
  const locale = {
    register(ns: string, localeOrDicts: string | Record<string, unknown>) {
      if (typeof localeOrDicts === 'string') {
        attempts.push({ kind: 'register', id: localeOrDicts })
      } else {
        for (const id of Object.keys(localeOrDicts)) attempts.push({ kind: 'register', id })
      }
      if (options.explode === true) throw new TypeError('locale service exploded')
      if (options.collision === true && localeOrDicts === 'ja') {
        throw new Error(`locale namespace "${ns}" already has locale "ja"`)
      }
      return () => {}
    },
    addLanguage(input: { id: string }) {
      attempts.push({ kind: 'addLanguage', id: input.id })
      if (options.explode === true) throw new TypeError('locale service exploded')
      if (options.collision === true) throw new Error(`locale "${input.id}" is already registered`)
      return () => {}
    },
  }
  return { locale, attempts }
}

/** Recording slots double: `inject` runs its callback immediately, exactly
 *  like the real service when the slot is ALREADY declared (renderer client.js
 *  — the synchronous rethrow window this fix closes). */
function makeSlots(options: { collision?: boolean } = {}) {
  const attempted: string[] = []
  const registered: string[] = []
  const slots = {
    inject: (name: string, callback: () => unknown) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register: (registerOptions: { name: string; id?: string }, component: unknown) => {
      attempted.push(registerOptions.name)
      if (options.collision === true) {
        throw new Error(`list slot "${registerOptions.name}" already has an entry with id "${String(registerOptions.id)}" at priority 0`)
      }
      void component
      registered.push(registerOptions.name)
      return () => {}
    },
  }
  return { slots, attempted, registered }
}

/** Mount the real apply() on a fake host. */
function mount(options: {
  theme?: ReturnType<typeof makeTheme>
  locale?: ReturnType<typeof makeLocale>['locale']
  slots?: ReturnType<typeof makeSlots>['slots']
} = {}) {
  const ctx = new Context()
  const theme = options.theme ?? makeTheme()
  ctx.provide('theme', theme)
  ctx.provide('slots', options.slots ?? makeSlots().slots)
  ctx.provide('locale', options.locale ?? makeLocale().locale)
  apply(ctx)
  return { ctx, theme }
}

describe('issue #23: locale registrations survive a peer language pack', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('a peer owning ja/ko/es/fr/de skips each colliding call quietly, the rest register', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { locale, attempts } = makeLocale({ collision: true })
    const { ctx } = mount({ locale })

    // Every call was still ATTEMPTED — the collision only skips our copy.
    expect(attempts.filter((a) => a.kind === 'register').map((a) => a.id))
      .toEqual(['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de'])
    expect(attempts.filter((a) => a.kind === 'addLanguage').map((a) => a.id))
      .toEqual(['ja', 'ko', 'es', 'fr', 'de'])
    // The benign class is silent (the peer's registration stands)…
    expect(warn).not.toHaveBeenCalled()
    // …and unloading releases the no-op disposers without throwing.
    await ctx.fiber.dispose()
  })

  it('an unexpected locale failure is logged and skipped, not rethrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { locale } = makeLocale({ explode: true })
    const { ctx } = mount({ locale })

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('registration skipped')
    await ctx.fiber.dispose()
  })
})

describe('issue #23: slot registrations survive a duplicate id', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('a duplicate row id skips that row instead of failing the entry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { slots, attempted, registered } = makeSlots({ collision: true })
    const { ctx } = mount({ slots })

    // All four General rows were attempted; every registration was skipped…
    expect(attempted).toHaveLength(4)
    expect(registered).toHaveLength(0)
    // …quietly, because the occupant is the same row (duplicate install).
    expect(warn).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })
})

describe('issue #23: theme registration survives an id owned elsewhere', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('a pre-owned flavour id skips registration but the flavour still applies', async () => {
    const theme = makeTheme()
    // The peer's instance already registered the flavour id…
    theme.themes.push({ id: 'catppuccin-latte', colorScheme: 'light', tokens: {} })
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')

    const { ctx } = mount({ theme })
    // …let the deferred restore (microtask) run. Pre-fix, `ensureThemeRegistered`
    // threw there as an uncaught error; now the skip falls through to setTheme.
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(theme.preference).toBe('catppuccin-latte')
    await ctx.fiber.dispose()
  })
})

describe('tolerantRegistration (unit)', () => {
  it('returns the real disposer on success and a no-op on a collision', () => {
    const dispose = vi.fn()
    expect(tolerantRegistration(() => dispose)).toBe(dispose)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noop = tolerantRegistration(() => { throw new Error('locale "ja" is already registered') })
    expect(typeof noop).toBe('function')
    expect(() => noop()).not.toThrow()
    expect(warn).not.toHaveBeenCalled() // the "already owned" class is silent

    const noisy = tolerantRegistration(() => { throw new Error('totally unexpected') })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(() => noisy()).not.toThrow()
    warn.mockRestore()
  })
})
