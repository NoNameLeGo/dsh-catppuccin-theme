// @vitest-environment jsdom
/**
 * Issue #38 — the adoption write-back must carry EVERY field of the durable
 * section, in an order that leaves `queuePersist` looking at a complete cache.
 *
 * The reported bug: `applyScopeSnapshot()` adopted a settings document into the
 * in-memory/local state but wrote only six of the eight section fields back to
 * localStorage. #36 had just added `followSystem` / `followDark`, so the pair
 * was never cached; two origins (Desktop `dsh-app://app` + a LAN web client)
 * then read their own stale value, re-pushed it, and ping-ponged the document
 * at ~0.8 `settings/mutate` per second while rewriting `cordis.patch.yml`.
 *
 * Three things are pinned here:
 *
 *  1. an adopted section lands in the cache field for field (a writer that is
 *     missing or pointed at the wrong key fails here);
 *  2. adopting a document does NOT push the stale value straight back (the
 *     loop itself);
 *  3. the `glass` write stays LAST — writing the follow pair AFTER
 *     `glass.applyRemote` still stops the loop, but arms issue #31's guard with
 *     a section no flush can settle, so the NEXT external edit is swallowed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  FOLLOW_DARK_KEY,
  FOLLOW_SYSTEM_KEY,
  FLAVOR_STORAGE_KEY,
  apply,
  readAutoCheck,
  readFlavor,
  readFollowDark,
  readFollowSystem,
  readOverrides,
  readShikiStyle,
  readUpdateChannel,
  writeLocalSection,
} from '../src/client/index.ts'
import { defaultSettingsSection, type CatppuccinSettingsSection, type GlassState } from '../src/state.ts'

/** Durable section with every field moved away from its shipped default. */
const NON_DEFAULT_SECTION: CatppuccinSettingsSection = {
  flavor: 'catppuccin-frappe',
  followSystem: true,
  followDark: 'catppuccin-macchiato',
  glass: {
    enabled: true,
    mode: 'compat',
    blur: 7,
    frost: 33,
    brightness: 66,
    gap: 20,
    glowStrength: 180,
    glowSize: 220,
    glow: true,
  },
  autoCheck: false,
  updateChannel: 'beta',
  overrides: { '--dsw-static-blue-500': '#cba6f7' },
  shikiStyle: 'italic-comments',
}

/** ThemeRuntime double: just enough for the client fibre to restore a flavour. */
function makeThemeRuntime(ctx: Context) {
  const rt: Record<string, unknown> = {
    themes: [
      { id: 'light', colorScheme: 'light', tokens: {} },
      { id: 'dark', colorScheme: 'dark', tokens: {} },
    ],
    preference: 'system',
    revision: 0,
    getTheme() {
      const preference = rt.preference as string
      const scheme = preference === 'dark' ? 'dark' : 'light'
      return { preference, revision: rt.revision, active: { colorScheme: scheme, tokens: {} } }
    },
    setTheme(id: string) {
      if (rt.preference === id) return
      rt.preference = id
      publish()
    },
    register(def: { id: string }) {
      const themes = rt.themes as { id: string }[]
      if (themes.some((theme) => theme.id === def.id)) throw new Error(`duplicate theme ${def.id}`)
      themes.push(def)
      publish()
      return () => {}
    },
    overrideTokens() {
      publish()
      return () => {}
    },
  }
  function publish(): void {
    rt.revision = (rt.revision as number) + 1
    ctx.emit('theme/change', (rt.getTheme as () => unknown)() as never)
  }
  return rt
}

/** Recording slots double (every registration is kept for the caller). */
function makeSlots() {
  const registered: { name: string; options: Record<string, unknown> }[] = []
  return {
    registered,
    slots: {
      inject: (_name: string, callback: () => unknown) => {
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register: (options: { name: string } & Record<string, unknown>) => {
        registered.push({ name: options.name, options })
        return () => {}
      },
    },
  }
}

/**
 * `configForms` double modelling a READY document that already carries a user
 * layer — the shape both ends of the reported loop were in. `push()` publishes
 * a newer snapshot, i.e. the other window committing a change.
 */
function makeConfigForms(options: { value: unknown; user: unknown; revision: number }) {
  const mutations: unknown[][] = []
  const snapshot = {
    status: 'ready' as const,
    mode: 'host' as const,
    user: options.user,
    value: options.value,
    revision: options.revision,
    writable: true,
    base: undefined,
  }
  const listeners = new Set<() => void>()
  const form = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async () => true,
    unset: async () => true,
    mutate: async (ops: unknown[]) => { mutations.push(ops); return true },
  }
  return {
    mutations,
    /** Publish a newer document and notify subscribers. */
    push(value: unknown, revision: number): void {
      const live = snapshot as { value: unknown; revision: number }
      live.value = value
      live.revision = revision
      for (const listener of [...listeners]) listener()
    },
    service: { get: () => form },
  }
}

/** Mount the client half against a ready document. */
function mount(forms: { service: unknown }) {
  const ctx = new Context()
  const theme = makeThemeRuntime(ctx)
  const { slots } = makeSlots()
  ctx.provide('theme', theme as never)
  ctx.provide('slots', slots as never)
  ctx.provide('locale', {
    register: () => () => {},
    addLanguage: () => () => {},
    bind: () => (key: string) => key,
    getLocale: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  } as never)
  ctx.provide('configForms', forms.service as never)
  apply(ctx)
  return { ctx, theme }
}

/** Long enough for the boot restore AND the 300 ms debounced flush. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 700))

/** Shorter settle for a snapshot published after boot has finished. */
const settleShort = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 120))

describe('writeLocalSection — every field of the section is cached (issue #38)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('writes a non-default section so that every reader gets its field', () => {
    const appliedGlass: GlassState[] = []
    writeLocalSection(NON_DEFAULT_SECTION, {
      applyRemote: (state) => { appliedGlass.push(state) },
    })

    expect(readFlavor()).toBe('catppuccin-frappe')
    // The pair #38 was about: a missing writer leaves the shipped default and
    // the next publish re-pushes it.
    expect(readFollowSystem()).toBe(true)
    expect(readFollowDark()).toBe('catppuccin-macchiato')
    expect(readAutoCheck()).toBe(false)
    expect(readUpdateChannel()).toBe('beta')
    expect(readOverrides()).toEqual({ '--dsw-static-blue-500': '#cba6f7' })
    expect(readShikiStyle()).toBe('italic-comments')
    // The glass knobs are the layer's job; it must receive the section verbatim.
    expect(appliedGlass).toEqual([NON_DEFAULT_SECTION.glass])
  })

  it('hands the glass layer the section LAST (its publish re-reads the cache)', () => {
    // Observable proxy for "glass goes last": by the time `applyRemote` runs,
    // the follow pair must already be on disk — that is exactly what
    // `queuePersist`'s `buildLocalState()` snapshot reads on the publish this
    // call triggers.
    let followDarkWhenGlassRan: string | null = null
    let followSystemWhenGlassRan: string | null = null
    writeLocalSection(NON_DEFAULT_SECTION, {
      applyRemote: () => {
        followDarkWhenGlassRan = localStorage.getItem(FOLLOW_DARK_KEY)
        followSystemWhenGlassRan = localStorage.getItem(FOLLOW_SYSTEM_KEY)
      },
    })
    expect(followDarkWhenGlassRan).toBe('catppuccin-macchiato')
    expect(followSystemWhenGlassRan).toBe('true')
  })
})

describe('adoption of a settings document (issue #38)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('caches the document follow pair instead of pushing the local one back', async () => {
    // Origin A chose frappé as the dark half; origin B already committed mocha.
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-frappe')
    localStorage.setItem(FOLLOW_DARK_KEY, 'catppuccin-frappe')
    const document = {
      ...defaultSettingsSection(),
      flavor: 'catppuccin-frappe' as const,
      followDark: 'catppuccin-mocha' as const,
    }
    const forms = makeConfigForms({
      user: { flavor: 'catppuccin-frappe' },
      value: document,
      revision: 5,
    })

    mount(forms)
    await settle()

    // The document wins…
    expect(readFollowDark()).toBe('catppuccin-mocha')
    // …and the adoption must not queue a write that carries the stale value
    // (that write is one turn of the reported ping-pong).
    expect(forms.mutations).toHaveLength(0)
  })

  it('still adopts a LATER external edit (issue #31 guard must not stay armed)', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-frappe')
    localStorage.setItem(FOLLOW_DARK_KEY, 'catppuccin-frappe')
    const document = {
      ...defaultSettingsSection(),
      flavor: 'catppuccin-frappe' as const,
      followDark: 'catppuccin-mocha' as const,
    }
    const forms = makeConfigForms({
      user: { flavor: 'catppuccin-frappe' },
      value: document,
      revision: 5,
    })

    mount(forms)
    await settle()

    // A second window commits a new dark half.
    forms.push({ ...document, followDark: 'catppuccin-macchiato' }, 6)
    await settleShort()

    // Regression guard for the WRITE ORDER: appending the follow writes after
    // `glass.applyRemote` also stops the loop, but arms `pendingLocalSection`
    // with a section no flush settles, so this adoption is skipped and the
    // cache stays on mocha (verified against that variant before the fix).
    expect(readFollowDark()).toBe('catppuccin-macchiato')
    expect(forms.mutations).toHaveLength(0)
  })
})
