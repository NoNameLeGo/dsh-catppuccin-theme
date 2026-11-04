// @vitest-environment jsdom
/**
 * Issue #36 — follow the OS light/dark scheme.
 *
 * The mechanism is a token OVERRIDE LAYER, not a theme switch: a registered
 * theme carries one `colorScheme`, so the runtime has to stay on the official
 * `system` preference (the media listener and `data-ds-theme-source: system`
 * both hang off it) while `overrideTokens` supplies `{ light, dark }` halves.
 * These tests pin the four things that make that true, plus the ways it must
 * degrade:
 *
 *  1. enabling follow stacks the layer AND moves the preference to `system`;
 *  2. the layer really carries two different halves;
 *  3. turning follow off, or picking a flavour, retires the layer and puts the
 *     fixed flavour back;
 *  4. a host without `overrideTokens` degrades to the fixed flavour instead of
 *     throwing (and the row hides the switch).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  FOLLOW_DARK_KEY,
  FOLLOW_SYSTEM_KEY,
  FLAVOR_STORAGE_KEY,
  RESTORE_STORAGE_KEY,
  apply,
  readFollowDark,
  readFollowSystem,
} from '../src/client/index.ts'
import { CATPPUCCIN_FLAVORS } from '../src/client/palettes.ts'
import type { CatppuccinRowInjected } from '../src/client/CatppuccinRow.tsx'

interface Snapshot { preference: string; revision: number }

/** One recorded override layer: source + the pairs handed to the runtime. */
interface Layer { source: string; tokens: Record<string, { light: string; dark: string }> }

/** ThemeRuntime double with `overrideTokens` (0.2.1 semantics: same-source
 *  replacement, per-scheme folding, disposer that is a no-op once replaced). */
function makeThemeRuntime(ctx: Context, withOverrides = true) {
  const rt: Record<string, unknown> = {
    themes: [
      { id: 'light', colorScheme: 'light', tokens: {} },
      { id: 'dark', colorScheme: 'dark', tokens: {} },
    ],
    preference: 'system',
    revision: 0,
    layers: [] as Layer[],
    disposed: 0,
    getTheme() {
      const preference = rt.preference as string
      const scheme = preference === 'dark' ? 'dark' : 'light'
      return { preference, revision: rt.revision, active: { colorScheme: scheme, tokens: {} } }
    },
    setTheme(id: string) {
      const themes = rt.themes as { id: string }[]
      if (id !== 'system' && !themes.some((theme) => theme.id === id)) throw new Error(`theme "${id}" is not registered`)
      if (rt.preference === id) return
      rt.preference = id
      publish()
    },
    /** `ThemeRuntime.adopt()`: writes the preference DIRECTLY, bypassing the
     *  `setTheme` wrapper the plugin installs. This is the boot/reload shape. */
    adopt(id: string) {
      if (rt.preference === id) return
      rt.preference = id
      publish()
    },
    register(def: { id: string }) {
      const themes = rt.themes as { id: string }[]
      if (themes.some((theme) => theme.id === def.id)) throw new Error(`duplicate theme ${def.id}`)
      themes.push(def)
      publish()
      return () => {
        rt.themes = themes.filter((theme) => theme.id !== def.id)
        if (rt.preference === def.id) rt.preference = 'system'
        publish()
      }
    },
    publish,
  }
  function publish(): void {
    rt.revision = (rt.revision as number) + 1
    ctx.emit('theme/change', (rt.getTheme as () => unknown)() as never)
  }
  if (withOverrides) {
    rt.overrideTokens = (source: string, tokens: Layer['tokens']) => {
      const layers = rt.layers as Layer[]
      const layer: Layer = { source, tokens }
      const index = layers.findIndex((entry) => entry.source === source)
      if (index === -1) layers.push(layer)
      else layers[index] = layer
      publish()
      return () => {
        const current = (rt.layers as Layer[]).indexOf(layer)
        if (current === -1) return // replaced by a newer layer for the same source
        ;(rt.layers as Layer[]).splice(current, 1)
        rt.disposed = (rt.disposed as number) + 1
        publish()
      }
    }
  }
  return rt as unknown as {
    getTheme(): { preference: string; active: { colorScheme: string } }
    setTheme(id: string): void
    adopt(id: string): void
    layers: Layer[]
    disposed: number
    preference: string
  }
}

/** Recording slots double: `inject` runs immediately (the real declaration
 *  contract), registrations are kept so a test can pull the injected face. */
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

/** Mount the client half. `scope` is never usable: the durable channel must not
 *  interfere with what these tests assert (localStorage is the only store). */
function mount(options: { withOverrides?: boolean } = {}) {
  const ctx = new Context()
  const theme = makeThemeRuntime(ctx, options.withOverrides ?? true)
  const { slots, registered } = makeSlots()
  ctx.provide('theme', theme as never)
  ctx.provide('slots', slots as never)
  ctx.provide('locale', {
    register: () => () => {},
    addLanguage: () => () => {},
    bind: () => (key: string) => key,
    getLocale: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  } as never)
  ctx.provide('settingsScope', {
    bind: () => ({
      getSnapshot: () => ({ status: 'loading', mode: 'host', user: undefined, value: undefined }),
      subscribe: () => () => {},
      mutate: async () => ({ ok: true }),
    }),
  } as never)
  apply(ctx)
  const page = registered.find((entry) => entry.name === 'settings.section')
  if (page === undefined) throw new Error('settings section was not registered')
  const face = (page.options.inject as () => { flavor: CatppuccinRowInjected })()
  return { ctx, theme, face: face.flavor }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

const tokenValue = (flavorId: string, name: string): string | undefined =>
  CATPPUCCIN_FLAVORS.find((flavor) => flavor.themeId === flavorId)?.tokens[name]

describe('issue #36: follow the OS scheme', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('stacks a two-half layer and keeps the preference on system', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme } = mount()
    await settle()

    expect(theme.getTheme().preference).toBe('system')
    expect(theme.layers).toHaveLength(1)
    const layer = theme.layers[0]
    // The light half is Latte, the dark half the persisted follow flavour — not
    // the same palette, or the feature would be a no-op.
    expect(layer.tokens['--dsw-alias-bg-base'].light).toBe(tokenValue('catppuccin-latte', '--dsw-alias-bg-base'))
    expect(layer.tokens['--dsw-alias-bg-base'].dark).toBe(tokenValue('catppuccin-mocha', '--dsw-alias-bg-base'))
    expect(layer.tokens['--dsw-alias-bg-base'].light).not.toBe(layer.tokens['--dsw-alias-bg-base'].dark)
  })

  it('every layer entry is a { light, dark } pair (a bare string throws upstream)', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme } = mount()
    await settle()

    for (const [name, pair] of Object.entries(theme.layers[0].tokens)) {
      expect(typeof pair.light, name).toBe('string')
      expect(typeof pair.dark, name).toBe('string')
    }
  })

  it('does not clobber the built-in preference "off" has to restore', async () => {
    localStorage.setItem(RESTORE_STORAGE_KEY, 'dark')
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    mount()
    await settle()

    // While follow owns the runtime the preference IS `system`; recording that
    // would make "off" restore `system` instead of the user's dark.
    expect(localStorage.getItem(RESTORE_STORAGE_KEY)).toBe('dark')
  })

  it('turning follow off retires the layer and restores the fixed flavour', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme, face } = mount()
    await settle()

    face.setFollowSystem(false)
    await settle()

    expect(readFollowSystem()).toBe(false)
    expect(theme.layers).toHaveLength(0)
    expect(theme.getTheme().preference).toBe('catppuccin-mocha')
  })

  it('picking a flavour ends follow mode (an explicit pick wins)', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme, face } = mount()
    await settle()

    face.select('catppuccin-frappe')
    await settle()

    expect(readFollowSystem()).toBe(false)
    expect(localStorage.getItem(FLAVOR_STORAGE_KEY)).toBe('catppuccin-frappe')
    expect(theme.getTheme().preference).toBe('catppuccin-frappe')
    expect(theme.layers).toHaveLength(0)
  })

  it('leaves follow mode off alone: the shipped behaviour is unchanged', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-latte')
    const { theme } = mount()
    await settle()

    expect(theme.getTheme().preference).toBe('catppuccin-latte')
    expect(theme.layers).toHaveLength(0)
  })

  it('a settings-document adopt cannot drag the runtime off system', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme } = mount()
    await settle()

    // ThemeRuntime.adopt() writes the preference directly (never through
    // setTheme), which is exactly the boot/reload shape.
    theme.adopt('dark')
    await settle()

    // An explicit Appearance pick is only recorded through the setTheme
    // wrapper, which `adopt()` bypasses — so this is NOT a user choice and the
    // follow layer must keep the runtime on `system`.
    expect(theme.getTheme().preference).toBe('system')
  })

  it('an explicit Appearance pick still wins for the session', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme } = mount()
    await settle()

    // Through the plugin's wrapper = a real click in the Appearance row.
    theme.setTheme('dark')
    await settle()

    expect(theme.getTheme().preference).toBe('dark')
    // The choice is not persisted: follow mode resumes on the next boot rather
    // than writing a durable field from a theme/change listener (issue #31).
    expect(readFollowSystem()).toBe(true)
  })

  it('reflects a follow-key change from another window', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    const { theme } = mount()
    await settle()
    expect(theme.getTheme().preference).toBe('catppuccin-mocha')

    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    window.dispatchEvent(new StorageEvent('storage', { key: FOLLOW_SYSTEM_KEY }))
    await settle()

    expect(theme.getTheme().preference).toBe('system')
    expect(theme.layers).toHaveLength(1)
  })

  it('rebuilds the layer when the other window changes the dark half', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme } = mount()
    await settle()
    expect(theme.layers[0].tokens['--dsw-alias-bg-base'].dark).toBe(tokenValue('catppuccin-mocha', '--dsw-alias-bg-base'))

    localStorage.setItem(FOLLOW_DARK_KEY, 'catppuccin-frappe')
    window.dispatchEvent(new StorageEvent('storage', { key: FOLLOW_DARK_KEY }))
    await settle()

    expect(theme.layers[0].tokens['--dsw-alias-bg-base'].dark).toBe(tokenValue('catppuccin-frappe', '--dsw-alias-bg-base'))
  })

  it('degrades to the fixed flavour on a host without overrideTokens', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    const { theme, face } = mount({ withOverrides: false })
    await settle()

    // No layer, no `system` switch — but the flavour still applies, so the user
    // sees Catppuccin rather than an unthemed UI.
    expect(theme.getTheme().preference).toBe('catppuccin-mocha')
    expect(face.followAvailable).toBe(false)
  })
})

describe('issue #36: follow-mode storage readers', () => {
  beforeEach(() => localStorage.clear())

  it('reads the flag only as the literal "true"', () => {
    expect(readFollowSystem()).toBe(false)
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'yes')
    expect(readFollowSystem()).toBe(false)
    localStorage.setItem(FOLLOW_SYSTEM_KEY, 'true')
    expect(readFollowSystem()).toBe(true)
  })

  it('only accepts the three DARK flavours as the dark half', () => {
    expect(readFollowDark()).toBe('catppuccin-mocha')
    localStorage.setItem(FOLLOW_DARK_KEY, 'catppuccin-latte')
    expect(readFollowDark()).toBe('catppuccin-mocha')
    localStorage.setItem(FOLLOW_DARK_KEY, 'catppuccin-frappe')
    expect(readFollowDark()).toBe('catppuccin-frappe')
  })
})
