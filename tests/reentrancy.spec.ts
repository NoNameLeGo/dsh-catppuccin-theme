// @vitest-environment jsdom
/**
 * Issue #10 regression: the plugin's flavour restore must NOT run
 * synchronously inside a `theme/change` dispatch. A synchronous setTheme
 * re-enters publish() and the ThemePresenter (registered after the plugin)
 * then applies the STALE snapshot carried by the OUTER dispatch last, so the
 * DOM ends up dark/system while the runtime preference is the flavour.
 *
 * This test mounts the real client `apply()` on a faithful ThemeRuntime
 * double and asserts that after adopt(dark) fires post-restore, the LAST
 * snapshot the presenter-like listener sees is the flavour.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FLAVOR_STORAGE_KEY, apply } from '../src/client/index.ts'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

interface Snapshot { preference: string; revision: number }

function makeThemeHost(initial: { value?: { preference: string } | undefined }) {
  let snap = initial
  const subs = new Set<() => void>()
  return {
    getSnapshot: () => snap,
    setSnapshot: (s: { value: { preference: string } | undefined }) => {
      snap = s
      for (const f of [...subs]) f()
    },
    subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f) },
  }
}

/** Faithful ThemeRuntime double (0.1.1-rc.2 / 0.1.2-rc.1 semantics). */
function makeThemeRuntime(ctx: Context, host: ReturnType<typeof makeThemeHost>) {
  const THEME_PREFERENCES = ['light', 'dark', 'system']
  const rt = {
    themes: [
      { id: 'light', colorScheme: 'light', tokens: {} },
      { id: 'dark', colorScheme: 'dark', tokens: {} },
    ],
    preference: 'system' as string,
    revision: 0,
    getTheme() {
      const active = rt.themes.find((t) => t.id === rt.preference)
      return {
        preference: rt.preference,
        revision: rt.revision,
        active: { colorScheme: active?.colorScheme ?? 'dark' },
      }
    },
    setTheme(id: string) {
      if (id !== 'system' && !rt.themes.some((t) => t.id === id)) throw new Error(`theme "${id}" is not registered`)
      if (rt.preference === id) return
      rt.preference = id
      if (THEME_PREFERENCES.includes(id)) {
        const snap = host.getSnapshot()
        host.setSnapshot({ value: { ...(snap.value ?? { preference: 'system' }), preference: id } })
      }
      rt.publish()
    },
    register(def: { id: string; colorScheme: string; tokens: Record<string, unknown> }) {
      if (rt.themes.some((t) => t.id === def.id)) throw new Error(`duplicate theme ${def.id}`)
      rt.themes.push(def)
      rt.publish()
      return () => {
        rt.themes = rt.themes.filter((t) => t.id !== def.id)
        if (rt.preference === def.id) rt.preference = 'system'
        rt.publish()
      }
    },
    adopt() {
      const section = host.getSnapshot().value
      if (section === undefined || rt.preference === section.preference) return
      rt.preference = section.preference
      rt.publish()
    },
    publish() {
      rt.revision += 1
      // The double models only the snapshot fields the plugin reads (preference /
      // revision); the real event payload is wider (fontSize / active / themes).
      ctx.emit('theme/change', rt.getTheme() as unknown as ThemeSnapshot)
    },
  }
  host.subscribe(() => rt.adopt())
  rt.adopt()
  return rt
}

/** settingsScope double: not ready at apply time; hydration happens on demand. */
function makeSettingsScope() {
  let snap = { status: 'loading', mode: 'host', user: undefined, value: undefined } as Record<string, unknown>
  const subs = new Set<() => void>()
  const scope = {
    getSnapshot: () => snap,
    subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f) },
    mutate: async () => ({ ok: true }),
    becomeReady(value: Record<string, unknown>) {
      snap = { status: 'ready', mode: 'host', user: { id: 'u1' }, value }
      for (const f of [...subs]) f()
    },
  }
  return { scope, service: { bind: () => scope } }
}

describe('issue #10: flavour restore must not re-enter the theme/change dispatch', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('adopt(dark) after the flavour is known still leaves the flavour applied last', async () => {
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    ctx.provide('slots', { inject: () => () => {}, register: () => () => {} })
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    const sss = makeSettingsScope()
    ctx.provide('settingsScope', sss.service as never)

    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    apply(ctx)

    // The presenter-like listener is registered AFTER the plugin's restore
    // listener — this is the real listener order (plugin before ThemePresenter).
    const applied: string[] = []
    ctx.on('theme/change', (snapshot: Snapshot) => {
      applied.push(snapshot.preference)
    })

    // Boot order of issue #10: the ui-theme settings section resolves AFTER
    // the flavour is restored → ThemeRuntime.adopt() publishes a dark snapshot.
    themeHost.setSnapshot({ value: { preference: 'dark' } })

    // Let the deferred restore (microtask) run.
    await new Promise((r) => setTimeout(r, 10))

    expect(theme.getTheme().preference).toBe('catppuccin-latte')
    expect(applied[applied.length - 1]).toBe('catppuccin-latte')
    // Sanity: the stale dark snapshot was applied at some point (the presenter
    // applies every event), but it must never be the LAST one.
    expect(applied).toContain('dark')
  })

  it('a session-explicit Appearance pick still wins over the persisted flavour', async () => {
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    ctx.provide('slots', { inject: () => () => {}, register: () => () => {} })
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    const sss = makeSettingsScope()
    ctx.provide('settingsScope', sss.service as never)

    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    apply(ctx)
    await new Promise((r) => setTimeout(r, 10)) // initial restore runs

    const applied: string[] = []
    ctx.on('theme/change', (snapshot: Snapshot) => {
      applied.push(snapshot.preference)
    })

    // The user explicitly clicks dark in the Appearance row (goes through the
    // setTheme wrapper → liveBuiltinPick = 'dark').
    theme.setTheme('dark')
    await new Promise((r) => setTimeout(r, 10))

    expect(theme.getTheme().preference).toBe('dark')
    expect(applied[applied.length - 1]).toBe('dark')
  })
})
