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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FLAVOR_STORAGE_KEY, apply } from '../src/client/index.ts'
import { CatppuccinDetailCard } from '../src/client/detail-card.tsx'
import { CATPPUCCIN_ENTRY_ID, defaultSettingsSection } from '../src/state.ts'
import { PACKAGE_NAME, UPDATE_CHECK_CLIENT_TIMEOUT_MS } from '../src/update-check.ts'
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

/** Recording slots double. `inject` runs its callback immediately — the real
 *  service fires it as soon as the slot is DECLARED (renderer client.js:
 *  `subscribeDeclaration` + `declarationEpoch`) — and every registration is
 *  remembered so a test can read the slot name, options and component. */
function makeSlots() {
  const registered: { name: string; options: Record<string, unknown>; component: unknown }[] = []
  return {
    registered,
    slots: {
      inject: (name: string, callback: () => unknown) => {
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register: (options: { name: string } & Record<string, unknown>, component: unknown) => {
        registered.push({ name: options.name, options, component })
        return () => {}
      },
    },
  }
}

/**
 * configForms double (issue #15's seam): the shape `get(entryId)` returns,
 * plus the `whileServed` gate the Plugins-page card rides.
 * @param options - `served: false` models a host that never serves the
 *  namespace; `withWhileServed: false` models a client without the gate;
 *  `user` / `value` / `revision` seed a document that ALREADY carries a user
 *  layer (the R2 rollback window needs an older document to roll back to).
 */
function makeConfigForms(options: {
  served?: boolean
  withWhileServed?: boolean
  user?: unknown
  value?: unknown
  revision?: number
} = {}) {
  const mutations: unknown[][] = []
  const snap = {
    status: 'ready' as const,
    mode: 'host' as const,
    // The new seam's "no user layer yet" is an EMPTY OBJECT (the profile
    // patch's `override`), so the boot push below has to fire.
    user: options.user ?? {},
    value: options.value,
    revision: options.revision ?? 2,
    writable: true,
    base: undefined,
  }
  const subs = new Set<() => void>()
  const form = {
    getSnapshot: () => snap,
    subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f) },
    set: async () => true,
    unset: async () => true,
    mutate: async (ops: unknown[]) => { mutations.push(ops); return true },
  }
  // `whileServed` registers the caller's card only while the namespace is
  // served and hands back its disposer; the double mirrors that contract, and
  // `served: false` models the withdrawal path.
  const whileServed = vi.fn(
    (namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) => {
      if (options.served === false) return () => {}
      const dispose = register(new Set(namespaces))
      return typeof dispose === 'function' ? dispose : () => {}
    },
  )
  const service = options.withWhileServed === false
    ? { get: () => form }
    : { get: () => form, whileServed }
  return { form, mutations, whileServed, service }
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

describe('issue #15: the client boots on either settings seam', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const mount = (provide: (ctx: Context) => void) => {
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    ctx.provide('slots', { inject: () => () => {}, register: () => () => {} })
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    provide(ctx)
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    apply(ctx)
    return { ctx, theme }
  }

  it('restores and persists the flavour through configForms (0.1.7+)', async () => {
    const forms = makeConfigForms()
    const { theme } = mount((ctx) => { ctx.provide('configForms', forms.service as never) })
    await new Promise((r) => setTimeout(r, 400)) // boot restore + debounced push

    expect(theme.getTheme().preference).toBe('catppuccin-latte')
    // The durable push went through the new channel, at the whole-section
    // granularity the adapter uses (one atomic mutation per burst).
    expect(forms.mutations).toHaveLength(1)
    const ops = forms.mutations[0] as { op: string; path: string[] }[]
    expect(ops.map((op) => op.path.join('.'))).toContain('flavor')
  })

  it('still restores the flavour on the legacy settingsScope seam', async () => {
    const sss = makeSettingsScope()
    const { theme } = mount((ctx) => { ctx.provide('settingsScope', sss.service as never) })
    await new Promise((r) => setTimeout(r, 10))
    expect(theme.getTheme().preference).toBe('catppuccin-latte')
  })

  it('hydrates when the settings service only appears after apply', async () => {
    // The durable transport must never gate activation: the plugin boots from
    // localStorage and adopts the service whenever it lands.
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    ctx.provide('slots', { inject: () => () => {}, register: () => () => {} })
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    apply(ctx)

    const forms = makeConfigForms()
    ctx.provide('configForms', forms.service as never)
    await new Promise((r) => setTimeout(r, 400))

    expect(theme.getTheme().preference).toBe('catppuccin-latte')
    // The late bind notified the plugin, so the boot push ran after all.
    expect(forms.mutations).toHaveLength(1)
  })

  it('pushes a pick made before the scope was usable instead of rolling it back (R2)', async () => {
    // The boot-window rollback (2026-10-10 review, R2): a change made while
    // the settings service is still absent has no channel to be pushed
    // through, and the service's FIRST snapshot describes an older document.
    // Without the pendingLocalPush flag the hydration "adopts the document"
    // and silently reverts the user's pick — this test pins the fix.
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    const { slots, registered } = makeSlots()
    ctx.provide('slots', slots as never)
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    apply(ctx)

    // The user picks a flavour while the settings service is still absent —
    // at this instant the durable push has nowhere to go.
    const row = registered.find((entry) => entry.options.id === 'catppuccin')
    if (row === undefined) throw new Error('flavour row was not registered')
    const face = (row.options.inject as () => { select: (choice: string) => void })()
    face.select('catppuccin-mocha')
    await new Promise((resolve) => setTimeout(resolve, 50)) // still inside the 300 ms debounce

    // The service lands and its document carries an OLDER choice (frappe)
    // from a previous session — exactly the state the rollback used to
    // overwrite the fresh pick with.
    const documentSection = { ...defaultSettingsSection(), flavor: 'catppuccin-frappe' as const }
    const forms = makeConfigForms({
      user: { flavor: 'catppuccin-frappe' },
      value: documentSection,
      revision: 7,
    })
    ctx.provide('configForms', forms.service as never)
    await new Promise((resolve) => setTimeout(resolve, 700)) // hydration + debounce + flush

    // The fresh pick was pushed — the localStorage cache still holds it and
    // the durable write went out with the mocha flavour.
    expect(localStorage.getItem(FLAVOR_STORAGE_KEY)).toBe('catppuccin-mocha')
    const written = forms.mutations.flat() as { op: string; path: string[]; value: unknown }[]
    expect(written.some((op) => op.path.join('.') === 'flavor' && op.value === 'catppuccin-mocha')).toBe(true)
    await ctx.fiber.dispose()
  })
})

/**
 * The Plugins-page card (the settings section on this plugin's own detail page
 * in the Plugin manager).
 *
 * The page renders `plugins.bundle.config` keyed by the BUNDLE PACKAGE NAME and
 * paints that section only when an entry is registered (its ledger reads
 * `ctx.slots.entries(...)`), so the key, the gate and the component are
 * contracts rather than implementation details. `slots.inject` waits for the
 * slot's declaration and `whileServed` for the namespace, which is what keeps
 * hosts without a Plugin manager (and the legacy settings seam) quiet.
 */
describe('Plugins-page card', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const mount = (provide: (ctx: Context) => void) => {
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    const { slots, registered } = makeSlots()
    ctx.provide('slots', slots as never)
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    provide(ctx)
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    apply(ctx)
    return { ctx, registered }
  }

  it('registers the card while the host serves the namespace', async () => {
    const forms = makeConfigForms()
    const { registered } = mount((ctx) => { ctx.provide('configForms', forms.service as never) })
    await new Promise((r) => setTimeout(r, 10)) // the inject callback runs on fiber activation

    expect(forms.whileServed).toHaveBeenCalledWith([CATPPUCCIN_ENTRY_ID], expect.any(Function))
    const card = registered.find((entry) => entry.name === 'plugins.bundle.config')
    // The page dispatches with `{ entryKey: pkg.name }`, i.e. the PACKAGE name
    // — NOT the profile entry id that keys the settings namespace.
    expect(card?.options.key).toBe(PACKAGE_NAME)
    expect(card?.options.key).not.toBe(CATPPUCCIN_ENTRY_ID)
    expect(card?.options.locale).toBe('catppuccin')
    expect(card?.component).toBe(CatppuccinDetailCard)
    // Additive: the General section keeps its three rows.
    expect(registered.filter((entry) => entry.name === 'settings.general.item')).toHaveLength(3)
  })

  it('keys the card by the manifest package name', () => {
    // The page dispatches with `entryKey: pkg.name` — the INSTALLED bundle's
    // name, i.e. the manifest's `name`. A drift here would orphan the section
    // silently: it would register under a key the page never dispatches.
    // `process.cwd()` rather than `import.meta.url`: this file runs under
    // jsdom, where `import.meta.url` is not a file URL.
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { name?: string }
    expect(PACKAGE_NAME).toBe(manifest.name)
  })

  it('withdraws the card when the namespace stops being served', async () => {
    const forms = makeConfigForms({ served: false })
    const { registered } = mount((ctx) => { ctx.provide('configForms', forms.service as never) })
    await new Promise((r) => setTimeout(r, 10))

    expect(forms.whileServed).toHaveBeenCalled()
    expect(registered.some((entry) => entry.name === 'plugins.bundle.config')).toBe(false)
  })

  it('registers no card on a client without whileServed, and never throws', async () => {
    const forms = makeConfigForms({ withWhileServed: false })
    const { registered } = mount((ctx) => { ctx.provide('configForms', forms.service as never) })
    await new Promise((r) => setTimeout(r, 10))

    expect(registered.some((entry) => entry.name === 'plugins.bundle.config')).toBe(false)
    // The rest of the plugin still registered on this host.
    expect(registered.filter((entry) => entry.name === 'settings.general.item')).toHaveLength(3)
  })

  it('registers no card on the legacy settingsScope seam', async () => {
    const sss = makeSettingsScope()
    const { registered } = mount((ctx) => { ctx.provide('settingsScope', sss.service as never) })
    await new Promise((r) => setTimeout(r, 10))

    expect(registered.some((entry) => entry.name === 'plugins.bundle.config')).toBe(false)
  })
})

/**
 * R1 (2026-10-10 review): the setTheme wrapper may only be restored while it
 * is still the method the plugin installed. Another extension replacing it in
 * the meantime owns the slot, and the pre-fix unconditional write-back of the
 * original would silently unhook that extension.
 */
describe('setTheme wrapper ownership (R1)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const mount = () => {
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    ctx.provide('slots', { inject: () => () => {}, register: () => () => {} })
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    return { ctx, theme }
  }

  it('restores the original setTheme on unload while the wrapper is still ours', async () => {
    const { ctx, theme } = mount()
    const original = theme.setTheme
    apply(ctx)
    expect(theme.setTheme).not.toBe(original) // the interception is installed

    await ctx.fiber.dispose()
    expect(theme.setTheme).toBe(original)
  })

  it('leaves a foreign replacement in place instead of unhooking it', async () => {
    const { ctx, theme } = mount()
    apply(ctx)

    // Another extension replaces what is now OUR wrapper — the normal
    // stacking order for an interception chain.
    const foreign: typeof theme.setTheme = () => {}
    theme.setTheme = foreign
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await ctx.fiber.dispose()

    // The pre-fix cleanup wrote the original back unconditionally, silently
    // dropping the foreign wrapper; now the replacement survives and the
    // conflict is surfaced instead.
    expect(theme.setTheme).toBe(foreign)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

/**
 * R3 (2026-10-10 review): the client half of the update check must cap its
 * same-origin fetch — a wedged host otherwise leaves the settings row in its
 * `checking` phase, where the disabled check button makes a retry impossible.
 */
describe('client update-check fetch discipline (R3)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** Mount apply() with a recording slots double and return the update face. */
  const mountUpdateFace = () => {
    const ctx = new Context()
    const themeHost = makeThemeHost({ value: undefined })
    const theme = makeThemeRuntime(ctx, themeHost)
    ctx.provide('theme', theme)
    const { slots, registered } = makeSlots()
    ctx.provide('slots', slots as never)
    ctx.provide('locale', { register: () => () => {}, addLanguage: () => () => {} })
    apply(ctx)
    const entry = registered.find((candidate) => candidate.options.id === 'catppuccin-update')
    if (entry === undefined) throw new Error('update row was not registered')
    const face = (entry.options.inject as () => {
      check: (channel: 'latest' | 'beta') => Promise<unknown>
    })()
    return { ctx, face }
  }

  it('caps the manual check and maps the abort to network.local', async () => {
    const { ctx, face } = mountUpdateFace()
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    let seenSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        seenSignal = init?.signal
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })))

    const pending = face.check('beta')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(timeout).toHaveBeenCalledWith(UPDATE_CHECK_CLIENT_TIMEOUT_MS)
    expect(seenSignal).toBe(controller.signal)

    controller.abort()
    await expect(pending).resolves.toEqual({ ok: false, code: 'network.local', error: 'network.local' })
    await ctx.fiber.dispose()
  })

  it('gives the periodic auto-check the same capped budget', async () => {
    vi.useFakeTimers()
    const { ctx } = mountUpdateFace()
    let seenSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      seenSignal = init?.signal
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, code: 'ok' }) })
    }))

    await vi.advanceTimersByTimeAsync(3100) // the 3 s boot probe fires

    expect(seenSignal).toBeInstanceOf(AbortSignal)
    await ctx.fiber.dispose()
  })
})
