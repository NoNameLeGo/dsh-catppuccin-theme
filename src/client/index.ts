/**
 * Catppuccin themes for the DeepSeek Harness web GUI — browser half.
 *
 * Registers the four Catppuccin flavours (Latte light / Frappé, Macchiato,
 * Mocha dark) into the official ThemeRuntime, so they become selectable
 * themes whose --dsw-* token overrides fully remap the UI palette. The
 * official Appearance row persists only the built-in light/dark/system
 * preferences, so this plugin also owns a settings row ("Catppuccin") that
 * lists the four flavours; selecting one switches the theme and persists the
 * flavour.
 *
 * Persistence is two-tier. The choice lives in two stores:
 *  - localStorage keys (`dsh.catppuccin.*`) — the in-browser cache: instant
 *    restore at boot and the cross-tab `storage` event bus;
 *  - the Host durable file (`$DSH_HOME/catppuccin-state.json`, served by
 *    `/catppuccin/state`, written by `src/host-state.ts`) — the source of
 *    truth. It exists because DSH Desktop launches `@deepseek-ai/dsh` with
 *    `--port 0` (a fresh random loopback port every launch) and localStorage
 *    is scoped per origin including the port, so a localStorage-only choice
 *    is silently emptied on every Desktop restart. The Host settings wire is
 *    not used: it only serves an explicit allowlist of namespaces (a
 *    plugin-owned namespace answers `settings-not-exposed`).
 * At boot the plugin fast-applies localStorage, then hydrates the Host file
 * and mirrors it back into localStorage; if the Host has nothing but this
 * browser session already chose something, that choice is migrated to the
 * Host. Every user change is written to localStorage immediately and pushed to
 * the Host (debounced) so it survives the next Desktop restart.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeRuntime, ThemeTokens } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge (settings.general.item).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CatppuccinRow, type CatppuccinRowInjected } from './CatppuccinRow.tsx'
import { en, zh, type CatppuccinKey } from './locales.ts'
import { CATPPUCCIN_FLAVORS, type CatppuccinFlavorInfo } from './palettes.ts'
import { GlassLayer } from './glass/glass-layer.ts'
import { GlassRow, type GlassRowInjected } from './glass/glass-row.tsx'
import { UpdateRow, type UpdateRowInjected } from './UpdateRow.tsx'
import type { UpdateCheckPayload } from '../update-check.ts'
import { UPDATE_ROUTE_PATH } from '../update-check.ts'
import {
  isDefaultState,
  STATE_VERSION,
  type CatppuccinState,
  type FlavorValue,
} from '../state.ts'
import {
  cancelDurablePersist,
  readDurableStateRemote,
  scheduleDurablePersist,
} from './state-sync.ts'
// Side-effect import: the glass stylesheet (auto-injected as a plugin-owned
// <style> tag; every rule is gated on the data-dsh-glass attribute).
import './glass/glass.module.css'

/** Locale namespace owned by this plugin. */
export const NS = 'catppuccin'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Catppuccin settings row's copy. */
    catppuccin: CatppuccinKey
  }
}

/** localStorage key carrying the persisted flavour choice. */
export const FLAVOR_STORAGE_KEY = 'dsh.catppuccin.flavor'

/** Accepted flavour values — the four registered theme ids plus `off`. These
 *  MUST stay in sync with the registered themes (guarded by
 *  tests/palettes.spec.ts) because the persisted value is the theme id. */
export const CATPPUCCIN_FLAVOR_VALUES = [
  ...CATPPUCCIN_FLAVORS.map((f) => f.themeId),
  'off',
] as const

/** `off` means: fall back to the official theme (default). */
export type FlavorChoice = (typeof CATPPUCCIN_FLAVOR_VALUES)[number]

/** The flavour whose themeId this is, or `off`. */
export function flavorFromThemeId(themeId: string): FlavorChoice {
  return CATPPUCCIN_FLAVORS.some((f) => f.themeId === themeId) ? themeId as FlavorChoice : 'off'
}

/** The flavour registered for a theme id, or undefined when not a Catppuccin theme. */
export function flavorInfo(themeId: string): CatppuccinFlavorInfo | undefined {
  return CATPPUCCIN_FLAVORS.find((f) => f.themeId === themeId)
}

/** Read the persisted flavour (absent / unknown values mean the default `off`). */
export function readFlavor(): FlavorChoice {
  try {
    const raw = localStorage.getItem(FLAVOR_STORAGE_KEY)
    return raw !== null && (CATPPUCCIN_FLAVOR_VALUES as readonly string[]).includes(raw)
      ? raw as FlavorChoice
      : 'off'
  } catch {
    return 'off'
  }
}

/** Persist the flavour choice (storage failures keep the in-memory state). */
export function writeFlavor(choice: FlavorChoice): void {
  try {
    localStorage.setItem(FLAVOR_STORAGE_KEY, choice)
  } catch {
    /* in-memory state still applies for this tab */
  }
}

/** Required services: slots + locale (settings rows) and theme (register + switch). */
export const inject = ['slots', 'locale', 'theme']

/**
 * Register the Catppuccin dictionaries, the four flavour themes, and the
 * settings row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'catppuccin: dictionaries')

  const theme = ctx.get('theme') as ThemeRuntime

  // Register the four flavour themes. Each carries the full --dsw-* token
  // dictionary for its flavour; the presenter applies them as body inline
  // variables when the theme is active.
  ctx.effect(() => {
    const disposers = CATPPUCCIN_FLAVORS.map((flavor) =>
      theme.register({
        id: flavor.themeId,
        colorScheme: flavor.colorScheme,
        tokens: flavor.tokens as ThemeTokens,
      }),
    )
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'catppuccin: flavour themes')

  // The glass layer: a toggleable glassmorphism skin on top of the Catppuccin
  // themes. It owns its lifecycle (enable flag + knobs persist in
  // localStorage as the in-browser cache; the durable copy is the Host file
  // hydrated/pushed below; every effect is released with this fiber). It is
  // created before the boot-restore effect so hydration can overlay the
  // persisted glass state onto the layer.
  const glass = new GlassLayer(ctx)

  // The current durable snapshot: flavour from the localStorage cache (the
  // authoritative write target of the settings row) plus the glass layer's
  // remote state. Passed to the debounced Host persist by reference so the
  // flush always captures the freshest values.
  const buildLocalState = (): CatppuccinState => ({
    version: STATE_VERSION,
    // `FlavorChoice` widens to `string` (palettes carry `themeId: string`), but
    // the runtime value is always one of the four theme ids or `off` — the
    // same set as `FlavorValue`, guarded by tests/state.spec.ts.
    flavor: readFlavor() as FlavorValue,
    glass: glass.getRemoteState(),
  })

  // Restore the persisted choice. Two stores feed one mutable `desired`
  // flavour: localStorage (the in-browser cache — instant at boot and the
  // cross-tab `storage` bus) and the Host's durable state file (the source of
  // truth — required by DSH Desktop, which boots on a fresh random loopback
  // port every launch so localStorage there always starts empty). Restoring is
  // also a two-step race at boot: the flavour themes are registered by this
  // plugin (so an immediate setTheme may run before registration), and the
  // official Appearance scope adoption (`adopt()`) re-applies the stored
  // light/dark/system preference once its scope loads, overriding us. So the
  // desired flavour is re-asserted on every theme change within a short boot
  // window; after that a theme change is a user action and must win.
  ctx.effect(() => {
    let desired: FlavorChoice = readFlavor()
    let settled = false
    const started = Date.now()
    const applyDesired = (): void => {
      if (settled) return
      if (Date.now() - started > 5000) {
        settled = true
        return
      }
      if (desired === 'off') return
      try {
        if (theme.getTheme().preference !== desired) theme.setTheme(desired)
      } catch {
        // Theme not registered yet — the registry-update theme/change retries.
      }
    }
    applyDesired()
    const disposer = ctx.on('theme/change', applyDesired)
    const timer = window.setTimeout(() => { settled = true }, 5000)
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== FLAVOR_STORAGE_KEY) return
      const next = readFlavor()
      if (next !== 'off') {
        try {
          theme.setTheme(next)
        } catch {
          /* unknown persisted value — keep the current theme */
        }
      }
    }
    window.addEventListener('storage', onStorage)

    // Any glass change (enable flag or knob) coalesces into one durable write.
    const offGlass = glass.subscribe(() => {
      scheduleDurablePersist(buildLocalState)
    })

    // Hydrate the durable source of truth without blocking paint. The Host
    // file read is same-origin and answers in ms, so this resolves inside the
    // boot window; if it ever arrives later the fast path keeps working.
    let cancelled = false
    void readDurableStateRemote().then((result) => {
      if (cancelled) return
      if (!result.available) return // route missing — localStorage-only still works
      if (result.state === null) {
        // Nothing durable yet. If this browser session already chose something
        // (e.g. a localStorage-only preference from before this fix), migrate
        // it to the Host so it survives a later Desktop restart.
        if (!isDefaultState(buildLocalState())) scheduleDurablePersist(buildLocalState)
        return
      }
      // Durable state is the source of truth: overlay it, mirror it into
      // localStorage (fast restore + cross-tab for later starts) and re-target
      // the boot re-assert.
      writeFlavor(result.state.flavor)
      glass.applyRemote(result.state.glass)
      desired = result.state.flavor
      applyDesired()
    })

    return () => {
      cancelled = true
      offGlass()
      disposer()
      window.clearTimeout(timer)
      window.removeEventListener('storage', onStorage)
      cancelDurablePersist()
    }
  }, 'catppuccin: boot restore')

  const injected = (): CatppuccinRowInjected => ({
    themes: CATPPUCCIN_FLAVORS.map((flavor) => ({
      id: flavor.themeId,
      label: flavor.label,
      accent: flavor.accent,
    })),
    current: () => {
      const pref = theme.getTheme().preference
      return flavorFromThemeId(pref)
    },
    subscribe: (listener) => ctx.on('theme/change', listener),
    select: (choice: FlavorChoice) => {
      if (choice === 'off') {
        // Revert to the official default (system-following).
        theme.setTheme('system')
        writeFlavor('off')
        scheduleDurablePersist(buildLocalState)
        return
      }
      const flavor = flavorInfo(choice)
      if (!flavor) return
      theme.setTheme(flavor.themeId)
      writeFlavor(flavor.themeId)
      scheduleDurablePersist(buildLocalState)
    },
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'catppuccin',
    order: 20,
    locale: NS,
    inject: injected,
  }, CatppuccinRow))

  const glassInjected = (): GlassRowInjected => ({
    getState: () => glass.getSnapshot(),
    subscribe: (listener) => glass.subscribe(listener),
    setEnabled: (enabled) => { glass.setEnabled(enabled) },
    setMode: (mode) => { glass.setMode(mode) },
    setBlur: (blur) => { glass.setBlur(blur) },
    setFrost: (frost) => { glass.setFrost(frost) },
    setBrightness: (brightness) => { glass.setBrightness(brightness) },
    resetDefaults: () => { glass.resetDefaults() },
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'catppuccin-glass',
    order: 21,
    locale: NS,
    inject: glassInjected,
  }, GlassRow))

  // Update check: the Host owns the npm lookup (Node fetch, no CORS); the row
  // only fetches the same-origin route and renders the verdict. Upgrade stays
  // a terminal action — the row just surfaces the CLI command.
  const updateInjected = (): UpdateRowInjected => ({
    check: async () => {
      try {
        const response = await fetch(UPDATE_ROUTE_PATH, { headers: { accept: 'application/json' } })
        return await response.json() as UpdateCheckPayload
      } catch {
        return { ok: false, code: 'network', error: 'network' }
      }
    },
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'catppuccin-update',
    order: 22,
    locale: NS,
    inject: updateInjected,
  }, UpdateRow))
}
