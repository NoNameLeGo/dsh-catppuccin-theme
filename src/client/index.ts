/**
 * Catppuccin themes for the DeepSeek Harness web GUI — browser half.
 *
 * Registers the four Catppuccin flavours (Latte light / Frappé, Macchiato,
 * Mocha dark) into the official ThemeRuntime, so they become selectable
 * themes whose --dsw-* token overrides fully remap the UI palette. The
 * official Appearance row persists only the built-in light/dark/system
 * preferences, so this plugin also owns a settings row ("Catppuccin") that
 * lists the four flavours; selecting one switches the theme and persists the
 * flavour in localStorage (the Host settings wire only serves an explicit
 * allowlist of namespaces — a plugin-owned namespace answers
 * `settings-not-exposed`, so a browser-local preference is the durable
 * store here). The choice is restored on boot.
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

  // Persisted flavour choice. The official ThemeRuntime only persists the
  // built-in preferences, and the Host settings wire refuses plugin-owned
  // namespaces (`settings-not-exposed`), so the choice lives in localStorage.
  // Restoring it is a two-step race at boot: the flavour themes are registered
  // by this plugin (so an immediate setTheme may run before registration), and
  // the official Appearance scope adoption (`adopt()`) re-applies the stored
  // light/dark/system preference once its scope loads, overriding us. So the
  // saved flavour is re-asserted on every theme change within a short boot
  // window; after that a theme change is a user action and must win.
  ctx.effect(() => {
    const saved = readFlavor()
    if (saved === 'off') return () => {}
    let settled = false
    const started = Date.now()
    const applySaved = (): void => {
      if (settled) return
      if (Date.now() - started > 5000) {
        settled = true
        return
      }
      try {
        if (theme.getTheme().preference !== saved) theme.setTheme(saved)
      } catch {
        // Theme not registered yet — the registry-update theme/change retries.
      }
    }
    applySaved()
    const disposer = ctx.on('theme/change', applySaved)
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
    return () => {
      disposer()
      window.clearTimeout(timer)
      window.removeEventListener('storage', onStorage)
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
        return
      }
      const flavor = flavorInfo(choice)
      if (!flavor) return
      theme.setTheme(flavor.themeId)
      writeFlavor(flavor.themeId)
    },
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'catppuccin',
    order: 20,
    locale: NS,
    inject: injected,
  }, CatppuccinRow))

  // The glass layer: a toggleable glassmorphism skin on top of the Catppuccin
  // themes. It owns its lifecycle (enable flag + knobs persist in
  // localStorage; every effect is released with this fiber).
  const glass = new GlassLayer(ctx)

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
