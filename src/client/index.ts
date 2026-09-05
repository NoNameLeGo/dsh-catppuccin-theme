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
 * Persistence is two-tier since 0.5.0. The choice lives in two stores:
 *  - localStorage keys (`dsh.catppuccin.*`) — the in-browser cache: instant
 *    restore at boot, the cross-tab `storage` event bus, and the fallback
 *    when the settings transport is unavailable;
 *  - the official settings document (namespace `catppuccin`, registered by
 *    the Host half in `src/index.ts`) — the source of truth, bound here
 *    through `ctx.settingsScope`. It exists because DSH Desktop launches
 *    `@deepseek-ai/dsh` with `--port 0` (a fresh random loopback port every
 *    launch) and localStorage is scoped per origin including the port, so a
 *    localStorage-only choice is silently emptied on every Desktop restart;
 *    the settings document lives under the DSH home and survives that. The
 *    pre-0.5.0 Host file + `/catppuccin/state` route are gone — the Host
 *    migrates the old file into the document once.
 * At boot the plugin fast-applies localStorage, then hydrates from the scope
 * snapshot once it resolves and mirrors it back into localStorage; if the
 * document holds nothing while this browser session already chose something,
 * that choice is pushed to the document. Every user change is written to
 * localStorage immediately and pushed to the scope (debounced) so it
 * survives the next Desktop restart. Without a usable scope (memory mode /
 * absent transport) everything degrades to localStorage alone.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ThemeRuntime, ThemeTokens } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) — since DSH
// 0.1.2 the slots registry lives in dsh-client-ui-renderer (the old
// dsh-client-runtime package is gone).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the settings-surface SlotMap merge (settings.general.item)
// and the settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CatppuccinRow, type CatppuccinRowInjected } from './CatppuccinRow.tsx'
import { en, zh, type CatppuccinKey } from './locales.ts'
import { CATPPUCCIN_FLAVORS, type CatppuccinFlavorId, type CatppuccinFlavorInfo } from './palettes.ts'
import { SHIKI_TOKENS } from './shiki-tokens.ts'
import { GlassLayer } from './glass/glass-layer.ts'
import { GlassRow, type GlassRowInjected } from './glass/glass-row.tsx'
import { UpdateRow, type UpdateRowInjected } from './UpdateRow.tsx'
import type { UpdateCheckPayload } from '../update-check.ts'
import { UPDATE_ROUTE_PATH } from '../update-check.ts'
import {
  isDefaultState,
  settingsSectionFromState,
  settingsSectionsEqual,
  STATE_VERSION,
  type CatppuccinState,
  type FlavorValue,
} from '../state.ts'
import {
  bindCatppuccinScope,
  cancelDurablePersist,
  durableStateFromSnapshot,
  isScopeUsable,
  persistStateToScope,
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

/** localStorage key recording the last built-in theme preference. */
export const RESTORE_STORAGE_KEY = 'dsh.catppuccin.restore'

/** Remember a built-in preference (system/light/dark) whenever the runtime is
 *  not on a Catppuccin flavour, so switching the plugin off restores the
 *  user's pre-plugin choice instead of dropping them onto 'system'. The boot
 *  preference is the settings-document value, so this survives Desktop's
 *  per-launch port churn without joining the durable state schema. */
export function rememberBuiltinPreference(preference: string): void {
  if ((CATPPUCCIN_FLAVOR_VALUES as readonly string[]).includes(preference)) return
  try {
    localStorage.setItem(RESTORE_STORAGE_KEY, preference)
  } catch {
    /* nothing to restore later — 'off' falls back to 'system' */
  }
}

/** The preference to restore when turning the flavour off (default: system). */
export function readRestoredPreference(): 'system' | 'light' | 'dark' {
  try {
    const raw = localStorage.getItem(RESTORE_STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

/** Built-in preferences the Appearance row can explicitly pick. */
const BUILTIN_PREFERENCES = ['light', 'dark', 'system'] as const
type BuiltinPreference = (typeof BUILTIN_PREFERENCES)[number]

function isBuiltinPreference(value: string): value is BuiltinPreference {
  return (BUILTIN_PREFERENCES as readonly string[]).includes(value)
}

/** Whether an observed built-in preference wins over the persisted flavour.
 *  Only a light/dark value the user explicitly picked in THIS session — the
 *  recorded `liveBuiltinPick` from the setTheme wrapper — wins. Values adopted
 *  from the settings document at boot/reload (`livePick` null) never win
 *  (issue #6: a doc persisted as `ui-theme.preference: light` was mistaken for
 *  a user choice and buried the flavour on every refresh/restart), and
 *  "system" never wins: while a flavour is on, the Catppuccin row is the
 *  active controller and the Appearance row must not bury the persisted
 *  choice. A user's explicit light/dark pick still wins immediately (matching
 *  livePick) and choosing "off" in the Catppuccin row restores it. */
export function builtinPickWins(
  preference: string,
  livePick: BuiltinPreference | null,
): boolean {
  if (preference !== 'light' && preference !== 'dark') return false
  return preference === livePick
}

/** Required services: slots + locale (settings rows), theme (register +
 *  switch), and the settings scope (durable persistence). */
export const inject = ['slots', 'locale', 'theme', 'settingsScope']

/**
 * Register the Catppuccin dictionaries, the four flavour themes, and the
 * settings row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'catppuccin: dictionaries')

  const theme = ctx.get('theme') as ThemeRuntime

  // Register the four flavour themes. Each carries the full --dsw-* token
  // dictionary for its flavour plus the Catppuccin syntax-highlighting
  // (--shiki-*) tokens; the presenter applies them as body inline variables
  // when the theme is active.
  ctx.effect(() => {
    const disposers = CATPPUCCIN_FLAVORS.map((flavor) => {
      // Flavour id for the shiki token lookup: themeId is "catppuccin-latte"
      // → key is "latte".
      const flavorId = flavor.themeId.replace('catppuccin-', '') as CatppuccinFlavorId
      const shiki = SHIKI_TOKENS[flavorId]
      return theme.register({
        id: flavor.themeId,
        colorScheme: flavor.colorScheme,
        tokens: { ...flavor.tokens, ...shiki } as ThemeTokens,
      })
    })
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'catppuccin: flavour themes')

  // The glass layer: a toggleable glassmorphism skin on top of the Catppuccin
  // themes. It owns its lifecycle (enable flag + knobs persist in
  // localStorage as the in-browser cache; the durable copy is the settings
  // document hydrated/pushed below; every effect is released with this fiber).
  // It is created before the boot-restore effect so hydration can overlay the
  // persisted glass state onto the layer.
  const glass = new GlassLayer(ctx)

  // The official settings scope for the Catppuccin namespace (registered by
  // the Host half). The document is the source of truth; the scope derives
  // from the shared mirror on this fiber and never blocks on the transport.
  const scope = bindCatppuccinScope(ctx)

  // The current durable snapshot: flavour from the localStorage cache (the
  // authoritative write target of the settings row) plus the glass layer's
  // remote state. Passed to the debounced scope persist by reference so the
  // flush always captures the freshest values.
  const buildLocalState = (): CatppuccinState => ({
    version: STATE_VERSION,
    // `FlavorChoice` widens to `string` (palettes carry `themeId: string`), but
    // the runtime value is always one of the four theme ids or `off` — the
    // same set as `FlavorValue`, guarded by tests/state.spec.ts.
    flavor: readFlavor() as FlavorValue,
    glass: glass.getRemoteState(),
  })

  // Debounced push of the current local state into the settings document.
  // When the scope is not usable (memory mode / absent transport) the write
  // is skipped entirely — localStorage stays the only store, exactly the
  // pre-0.5.0 route-missing fallback.
  const persistLocal = (): void => {
    if (!isScopeUsable(scope.getSnapshot())) return
    void persistStateToScope(scope, buildLocalState())
  }

  // Restore the persisted choice and defend it against the built-in
  // Appearance scope's `adopt()`. Two stores feed the desired flavour:
  // localStorage (the in-browser cache — instant at boot and the cross-tab
  // `storage` bus) and the settings document (the source of truth —
  // required by DSH Desktop, which boots on a fresh random loopback port every
  // launch so localStorage there always starts empty).
  //
  // The re-assert is not a fixed boot window. The built-in ThemeRuntime's
  // `adopt()` re-applies the settings-document preference on every settings
  // reload — and switching the model always reloads the settings document —
  // writing "system" when `ui-theme.preference` was never written, or the
  // persisted light/dark when the document holds one. adopt() writes the
  // runtime preference directly and bypasses setTheme, so the setTheme wrapper
  // below is the one seam that tells explicit picks apart: we restore our
  // flavour whenever the runtime preference is NOT a built-in value the user
  // clicked in the Appearance row THIS session, and choosing "off" in the
  // Catppuccin row clears the persisted flavour before the switch so this
  // guard does not fight it.
  ctx.effect(() => {
    // Session-live record of the user's last EXPLICIT built-in pick, kept by
    // the setTheme wrapper below. The wrapper is the only seam that
    // distinguishes "the user clicked light/dark/system in the Appearance
    // row" from "ThemeRuntime.adopt() copied the settings document's value
    // at boot/reload" — adopt() writes the preference directly and never goes
    // through setTheme, so a doc-adopted light/dark leaves this null and the
    // guard below cannot mistake it for a user choice. Picking a Catppuccin
    // flavour (or the wrapper's own flavour restore) clears the record.
    let liveBuiltinPick: BuiltinPreference | null = null
    const originalSetTheme = theme.setTheme
    theme.setTheme = (id) => {
      liveBuiltinPick = isBuiltinPreference(id) ? id : null
      originalSetTheme.call(theme, id)
    }

    const applyDesired = (): void => {
      // Record the built-in preference on every non-flavour observation (boot,
      // adopt() reloads, explicit Appearance changes) BEFORE any re-assert, so
      // 'off' below can hand the user back exactly what they had.
      rememberBuiltinPreference(theme.getTheme().preference)
      const desired = readFlavor()
      if (desired === 'off') return
      const preference = theme.getTheme().preference
      if (preference === desired) return
      // A built-in preference only wins if the user explicitly picked it in
      // THIS session (matching liveBuiltinPick). "system" and boot/adopt()
      // values adopted from the settings document (liveBuiltinPick null) are
      // stale for the plugin — the Catppuccin row choice is newer than the
      // document's light/dark, so restore the flavour then.
      if (builtinPickWins(preference, liveBuiltinPick)) return
      try {
        theme.setTheme(desired)
      } catch {
        // Theme not registered yet — a later theme/change re-runs applyDesired.
      }
    }
    applyDesired()
    const disposer = ctx.on('theme/change', applyDesired)
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
      scheduleDurablePersist(persistLocal)
    })

    // Hydrate the durable source of truth without blocking paint. The scope
    // derives from the shared settings mirror (no wire read of its own), so
    // this is sync once the mirror has resolved; if it arrives later, the
    // subscription below catches it — the localStorage fast path keeps
    // working in the meantime.
    //
    // The hydration is echo-safe: the Host folds our own committed writes
    // back into the mirror, and when the echoed section equals the local
    // state (the normal case after a change we just persisted) we skip the
    // write-back. A section that differs is an external edit (another
    // surface, a hand-edited document, a reload) — the document wins.
    const applyScopeSnapshot = (): void => {
      const snapshot = scope.getSnapshot()
      const state = durableStateFromSnapshot(snapshot)
      if (state === null) return // loading / memory / absent — localStorage-only
      const local = buildLocalState()
      if (snapshot.user === undefined) {
        // No user layer in the document yet: this session's localStorage
        // choice is newer than the shipped defaults the document resolves
        // to, so push it into the document (the upgrade path for a
        // localStorage-only session predating the settings migration).
        if (!isDefaultState(local)) scheduleDurablePersist(persistLocal)
        return
      }
      // A document the user wrote wins over the local cache, but echoes of
      // our own committed writes are skipped (they equal the local state).
      if (settingsSectionsEqual(
        settingsSectionFromState(local),
        settingsSectionFromState(state),
      )) return // our own echo — nothing to adopt
      writeFlavor(state.flavor)
      glass.applyRemote(state.glass)
      applyDesired()
    }
    applyScopeSnapshot()
    const offScope = scope.subscribe(applyScopeSnapshot)

    return () => {
      offScope()
      offGlass()
      disposer()
      window.removeEventListener('storage', onStorage)
      cancelDurablePersist()
      // Undo the setTheme wrapper so a stopped plugin leaves the runtime as
      // it found it.
      theme.setTheme = originalSetTheme
    }
  }, 'catppuccin: theme restore')

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
        // Restore the built-in preference the user had before the flavour
        // ('system' when nothing was recorded). Persist the abandoned choice
        // BEFORE setTheme: setTheme emits theme/change synchronously, so the
        // restore guard must already read `off` here and not re-assert the
        // previous flavour.
        writeFlavor('off')
        theme.setTheme(readRestoredPreference())
        scheduleDurablePersist(persistLocal)
        return
      }
      const flavor = flavorInfo(choice)
      if (!flavor) return
      // Persist first so the restore guard (a theme/change listener) sees the
      // new flavour when setTheme below emits synchronously.
      writeFlavor(flavor.themeId)
      theme.setTheme(flavor.themeId)
      scheduleDurablePersist(persistLocal)
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
