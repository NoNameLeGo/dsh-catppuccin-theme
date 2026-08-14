/**
 * Catppuccin themes for the DeepSeek Harness web GUI — browser half.
 *
 * Registers the four Catppuccin flavours (Latte light / Frappé, Macchiato,
 * Mocha dark) into the official ThemeRuntime, so they become selectable
 * themes whose --dsw-* token overrides fully remap the UI palette. The
 * official Appearance row persists only the built-in light/dark/system
 * preferences, so this plugin also owns a settings row ("Catppuccin") that
 * lists the four flavours; selecting one writes the flavour to the
 * `dsh-catppuccin` settings namespace (persisted by the host half) and
 * switches the theme, and the choice is restored on boot.
 */
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeRuntime, ThemeTokens } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CatppuccinRow, type CatppuccinRowInjected } from './CatppuccinRow.tsx'
import { en, zh, type CatppuccinKey } from './locales.ts'
import { CATPPUCCIN_FLAVORS, type CatppuccinFlavorInfo } from './palettes.ts'

/** Locale namespace owned by this plugin. */
export const NS = 'catppuccin'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Catppuccin settings row's copy. */
    catppuccin: CatppuccinKey
  }
}

/** The settings namespace string (must match the host half's settingsNamespace). */
export const SETTINGS_NAMESPACE = 'dsh-catppuccin'

/** `off` means: fall back to the official theme (default). */
export type FlavorChoice = CatppuccinFlavorInfo['themeId'] | 'off'

/** The flavour whose themeId this is, or `off`. */
export function flavorFromThemeId(themeId: string): FlavorChoice {
  return CATPPUCCIN_FLAVORS.some((f) => f.themeId === themeId) ? themeId as FlavorChoice : 'off'
}

/** The flavour registered for a theme id, or undefined when not a Catppuccin theme. */
export function flavorInfo(themeId: string): CatppuccinFlavorInfo | undefined {
  return CATPPUCCIN_FLAVORS.find((f) => f.themeId === themeId)
}

/** Required services: slots + locale (settings row) and theme (register + switch). */
export const inject = ['slots', 'locale', 'theme', 'settingsScope', 'connection', 'remote']

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
  // built-in preferences, so the choice lives in our own settings namespace.
  const binder = ctx.get('settingsScope') as { bind<T>(spec: { namespace: string }): SettingsScope<{ flavor: FlavorChoice }> }
  const scope = binder.bind<{ flavor: FlavorChoice }>({ namespace: SETTINGS_NAMESPACE })

  // Restore the saved flavour on boot once the settings section has loaded.
  // The scope starts in the "loading" state and only turns "ready" after the
  // host document arrives, so a one-shot read at apply() would always miss
  // the value; subscribe and restore on the first ready snapshot instead.
  ctx.effect(() => {
    let restored = false
    const restoreOnce = () => {
      if (restored) return
      const snapshot = scope.getSnapshot()
      if (snapshot.status !== 'ready') return
      restored = true
      const saved = snapshot.value?.flavor
      if (saved !== undefined && saved !== 'off') {
        try {
          theme.setTheme(saved)
        } catch {
          // Theme not registered yet — impossible here (registered above),
          // but stay safe against a stale persisted value.
        }
      }
    }
    restoreOnce()
    const unsubscribe = scope.subscribe(restoreOnce)
    return () => {
      unsubscribe()
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
    select: async (choice: FlavorChoice) => {
      if (choice === 'off') {
        // Revert to the official default (system-following).
        theme.setTheme('system')
        await scope.set('flavor', 'off').catch((err) => {
          console.error('[dsh-catppuccin] persist off failed:', err)
        })
        return
      }
      const flavor = flavorInfo(choice)
      if (!flavor) return
      theme.setTheme(flavor.themeId)
      await scope.set('flavor', flavor.themeId).catch((err) => {
        console.error('[dsh-catppuccin] persist flavor failed:', err)
      })
    },
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'catppuccin',
    order: 20,
    locale: NS,
    inject: injected,
  }, CatppuccinRow))
}
