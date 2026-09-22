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
 * absent transport) everything degrades to localStorage alone. The debounced
 * write is read-side guarded (item C/X): a flush whose base revision the
 * document has moved past abandons the stale write, re-adopts the remote
 * state, and tells the update row "另一窗口已更新，本地改动未保存".
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
import { de, en, es, fr, ja, ko, zh, type CatppuccinKey } from './locales.ts'
import { CATPPUCCIN_FLAVORS, type CatppuccinFlavorId, type CatppuccinFlavorInfo } from './palettes.ts'
import { SHIKI_TOKENS } from './shiki-tokens.ts'
import { GlassLayer } from './glass/glass-layer.ts'
import { GlassRow, type GlassRowInjected } from './glass/glass-row.tsx'
import { UpdateRow, type UpdateRowInjected } from './UpdateRow.tsx'
import type { UpdateCheckPayload } from '../update-check.ts'
import { UPDATE_ROUTE_PATH } from '../update-check.ts'
import {
  DEFAULT_AUTO_CHECK,
  DEFAULT_SHIKI_STYLE,
  DEFAULT_UPDATE_CHANNEL,
  hasUnpersistableOverrides,
  isDefaultState,
  sanitizeOverrides,
  settingsSectionFromState,
  settingsSectionsEqual,
  STATE_VERSION,
  type CatppuccinSettingsSection,
  type CatppuccinState,
  type FlavorValue,
  type ShikiStyle,
  type UpdateChannel,
} from '../state.ts'
import {
  bindCatppuccinScope,
  cancelDurablePersist,
  createBaseRevisionTracker,
  durableStateFromSnapshot,
  isScopeUsable,
  persistStateToScope,
  scheduleDurablePersist,
} from './state-sync.ts'
// The glass stylesheet is intentionally NOT imported here: it ships as the
// generated `GLASS_CSS_TEXT` string (`glass-css.gen.ts`, built by
// scripts/gen-glass-css.mjs) and `GlassLayer` mounts/removes the <style>
// tag on enable/disable — item II (lazy glass CSS).

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

/** localStorage key recording the last built-in theme preference. */
export const RESTORE_STORAGE_KEY = 'dsh.catppuccin.restore'

/** localStorage key carrying the auto-check update preference (item H). */
export const AUTO_CHECK_KEY = 'dsh.catppuccin.autoCheck'

/** localStorage key carrying the update channel preference (item I). */
export const UPDATE_CHANNEL_KEY = 'dsh.catppuccin.updateChannel'

/** localStorage key carrying the user token overrides JSON (item K). */
export const OVERRIDES_KEY = 'dsh.catppuccin.overrides'

/** localStorage key carrying the shiki style preference (item M). */
export const SHIKI_STYLE_KEY = 'dsh.catppuccin.shikiStyle'

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

/** Whether localStorage carries an EXPLICIT `off` flavour choice.
 *
 * `readFlavor()` maps both "no value" and "off" to `off`, and the two are not
 * the same thing: DSH Desktop boots the GUI on a fresh random loopback port, so
 * its localStorage starts empty on every launch and the settings document —
 * which may legitimately hold a flavour — is what should win. Only a literal
 * `off` in storage proves the user (or another window) actually turned the
 * flavour off, which is the case the cross-tab restore must act on (audit F4). */
export function readExplicitFlavorOff(): boolean {
  try {
    return localStorage.getItem(FLAVOR_STORAGE_KEY) === 'off'
  } catch {
    return false
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

/** Read the persisted auto-check flag (absent means the shipped default: on). */
export function readAutoCheck(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_CHECK_KEY)
    return raw === null ? DEFAULT_AUTO_CHECK : raw === 'true'
  } catch {
    return DEFAULT_AUTO_CHECK
  }
}

/** Persist the auto-check flag. */
export function writeAutoCheck(value: boolean): void {
  try {
    localStorage.setItem(AUTO_CHECK_KEY, String(value))
  } catch {
    /* in-memory state still applies */
  }
}

/** Read the persisted update channel (absent means `latest`). */
export function readUpdateChannel(): UpdateChannel {
  try {
    return localStorage.getItem(UPDATE_CHANNEL_KEY) === 'beta' ? 'beta' : DEFAULT_UPDATE_CHANNEL
  } catch {
    return DEFAULT_UPDATE_CHANNEL
  }
}

/** Persist the update channel. */
export function writeUpdateChannel(value: UpdateChannel): void {
  try {
    localStorage.setItem(UPDATE_CHANNEL_KEY, value)
  } catch {
    /* in-memory state still applies */
  }
}

/** Read the persisted token overrides (unparseable/absent → empty map).
 *
 * Sanitized on read (`sanitizeOverrides`, the same guard the settings document
 * goes through) so localStorage and the durable section always have the SAME
 * shape. Without it a key that is not a `--` token (e.g. `dsw-static-blue-500`
 * typed without the dashes) lives in localStorage only: the hydration compares
 * the two shapes, sees a difference, and "the document wins" overwrites the
 * entry — the user's row vanished a debounce-beat after it was typed. */
export function readOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    if (raw === null) return {}
    return sanitizeOverrides(JSON.parse(raw))
  } catch {
    return {}
  }
}

/** Persist the token overrides (storage failures keep the in-memory state). */
export function writeOverrides(value: Record<string, string>): void {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(value))
  } catch {
    /* in-memory state still applies */
  }
}

let overridesSnapshotCache: Record<string, string> | null = null

/** Stable-reference snapshot of the token overrides for `useSyncExternalStore`.
 * `readOverrides()` parses localStorage and returns a NEW object per call —
 * a React store whose getSnapshot returns a fresh reference every time loops
 * forever ("Maximum update depth exceeded") and the settings row crashes.
 * This accessor returns the SAME object while the persisted map is unchanged
 * and swaps only when the content actually differs. */
export function overridesSnapshot(): Record<string, string> {
  const next = readOverrides()
  const cached = overridesSnapshotCache
  if (cached !== null && JSON.stringify(cached) === JSON.stringify(next)) return cached
  overridesSnapshotCache = next
  return next
}

/** Read the persisted shiki style (absent means the shipped default). */
export function readShikiStyle(): ShikiStyle {
  try {
    return localStorage.getItem(SHIKI_STYLE_KEY) === 'italic-comments' ? 'italic-comments' : DEFAULT_SHIKI_STYLE
  } catch {
    return DEFAULT_SHIKI_STYLE
  }
}

/** Persist the shiki style. */
export function writeShikiStyle(value: ShikiStyle): void {
  try {
    localStorage.setItem(SHIKI_STYLE_KEY, value)
  } catch {
    /* in-memory state still applies */
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
 * Register the Catppuccin dictionaries, the flavour themes (lazy — item JJ:
 * only the active flavour is registered, the rest on first selection), and
 * the settings rows.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Bilingual balance is enforced by the typed register call (zh + en);
  // ja/ko/es/fr/de ride the untyped language-pack form and are registered
  // as selectable languages (fallback chain → en) so the dictionaries are
  // reachable without an external language pack (item CC).
  ctx.effect(() => {
    const disposers = [
      ctx.locale.register(NS, { zh, en }),
      ctx.locale.register(NS, 'ja', ja),
      ctx.locale.register(NS, 'ko', ko),
      ctx.locale.register(NS, 'es', es),
      ctx.locale.register(NS, 'fr', fr),
      ctx.locale.register(NS, 'de', de),
      ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
      ctx.locale.addLanguage({ id: 'ko', label: '한국어', fallback: 'en' }),
      ctx.locale.addLanguage({ id: 'es', label: 'Español', fallback: 'en' }),
      ctx.locale.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' }),
      ctx.locale.addLanguage({ id: 'de', label: 'Deutsch', fallback: 'en' }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'catppuccin: dictionaries')

  const theme = ctx.get('theme') as ThemeRuntime

  // Lazy theme registration (item JJ): at most the flavour currently in use
  // is registered; selecting a flavour registers it on demand and the fiber
  // disposer releases every registration. Overrides (item K) and the shiki
  // style (item M) are read at registration time, so a preference change
  // re-registers the active flavour with the merged tokens.
  const themeDisposers = new Map<string, () => void>()
  const registerThemeFor = (flavor: CatppuccinFlavorInfo): void => {
    if (themeDisposers.has(flavor.themeId)) return
    // Flavour id for the shiki token lookup: themeId is "catppuccin-latte"
    // → key is "latte".
    const flavorId = flavor.themeId.replace('catppuccin-', '') as CatppuccinFlavorId
    const shiki = SHIKI_TOKENS[flavorId][readShikiStyle()]
    const disposer = theme.register({
      id: flavor.themeId,
      colorScheme: flavor.colorScheme,
      tokens: { ...flavor.tokens, ...shiki, ...readOverrides() } as ThemeTokens,
    })
    themeDisposers.set(flavor.themeId, disposer)
  }
  const ensureThemeRegistered = (themeId: string): void => {
    const flavor = flavorInfo(themeId)
    if (flavor !== undefined) registerThemeFor(flavor)
  }
  const disposeThemeRegistrations = (): void => {
    for (const dispose of themeDisposers.values()) dispose()
    themeDisposers.clear()
  }
  ctx.effect(() => disposeThemeRegistrations, 'catppuccin: flavour theme disposers')

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
  // remote state and the preference fields. Passed to the debounced scope
  // persist by reference so the flush always captures the freshest values.
  const buildLocalState = (): CatppuccinState => ({
    version: STATE_VERSION,
    // `FlavorChoice` widens to `string` (palettes carry `themeId: string`), but
    // the runtime value is always one of the four theme ids or `off` — the
    // same set as `FlavorValue`, guarded by tests/state.spec.ts.
    flavor: readFlavor() as FlavorValue,
    glass: glass.getRemoteState(),
    autoCheck: readAutoCheck(),
    updateChannel: readUpdateChannel(),
    overrides: readOverrides(),
    shikiStyle: readShikiStyle(),
  })

  // Preference pub/sub: the settings rows read/write autoCheck, channel,
  // overrides and shikiStyle through localStorage; any change re-renders the
  // rows (emitPrefs) and the conflict counter feeds the update row's
  // "另一窗口已更新" banner (item X).
  const prefsListeners = new Set<() => void>()
  const emitPrefs = (): void => {
    for (const listener of prefsListeners) listener()
  }
  let conflictCount = 0
  const conflictListeners = new Set<() => void>()
  const emitConflict = (): void => {
    conflictCount += 1
    for (const listener of conflictListeners) listener()
  }

  // Re-register the active flavour after an override/shiki-style change so
  // the new token mix applies (the disposed registration is replaced by one
  // carrying the merged overrides).
  const reapplyThemePrefs = (): void => {
    const active = theme.getTheme().preference
    const flavor = flavorInfo(active)
    if (flavor === undefined || !themeDisposers.has(flavor.themeId)) return
    disposeThemeRegistrations()
    registerThemeFor(flavor)
  }

  // Debounced push of the current local state into the settings document.
  // When the scope is not usable (memory mode / absent transport) the write
  // is skipped entirely — localStorage stays the only store, exactly the
  // pre-0.5.0 route-missing fallback. The write is read-side guarded (item
  // C/X): a flush whose base revision the document moved past returns
  // `stale`, the local change is abandoned, and the remote state is
  // re-adopted + surfaced in the update row.
  let lastWrittenSection: CatppuccinSettingsSection | undefined
  let handleStaleConflict: (() => void) | undefined
  // The revision the pending write is based on, captured when the change is
  // SCHEDULED (audit F2): reading it at flush time made the read-side staleness
  // guard compare a revision with itself — both reads sit in one synchronous
  // block — so `'stale'` was unreachable and an external edit inside the
  // debounce window was silently overwritten. One capture per burst.
  const baseRevisionTracker = createBaseRevisionTracker()
  const queuePersist = (): void => {
    baseRevisionTracker.capture(() => scope.getSnapshot().revision)
    scheduleDurablePersist(persistLocal)
  }
  const persistLocal = (): void => {
    // Consume the base first: a bail-out (unusable scope) must not leave it
    // behind for the next burst.
    const baseRevision = baseRevisionTracker.take()
    const snapshot = scope.getSnapshot()
    if (!isScopeUsable(snapshot)) return
    const state = buildLocalState()
    void persistStateToScope(scope, state, { baseRevision, lastWrittenSection }).then((outcome) => {
      if (outcome === 'written') {
        lastWrittenSection = settingsSectionFromState(state)
      } else if (outcome === 'stale') {
        emitConflict()
        handleStaleConflict?.()
      }
    })
  }

  // Auto-check (item H): the last verdict the periodic checker stored (the
  // update row surfaces it on mount) plus the arm hook the preference
  // setter re-invokes on toggle (the timers themselves live in the restore
  // effect below, so they die with the fiber).
  const AUTO_CHECK_BOOT_DELAY_MS = 3000
  const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
  let lastAutoResult: UpdateCheckPayload | null = null
  let armAutoCheck: (() => void) | undefined

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

    // Issue #10: a synchronous setTheme inside a theme/change dispatch
    // re-enters publish() — the ThemePresenter (registered after us) then
    // applies the STALE snapshot carried by the OUTER dispatch last, so the
    // DOM ends up dark/system while the runtime preference is the flavour.
    // Defer the restore out of the current dispatch (microtask) and re-check
    // at run time, so the flavour's setTheme is always the LAST event the
    // presenter sees. A single in-flight restore coalesces repeated
    // observations (boot, adopt() reloads, storage echoes).
    let restorePending = false
    // `desired` is widened to string on purpose: the SAME deferred path also
    // carries the built-in restore (audit F4) — when the persisted choice went
    // 'off' somewhere else, the theme to apply is a built-in preference
    // (`system`/`light`/`dark`), not a flavour id.
    const scheduleRestore = (desired: string): void => {
      if (restorePending) return
      restorePending = true
      queueMicrotask(() => {
        restorePending = false
        const preference = theme.getTheme().preference
        if (preference === desired) return
        // Re-check the guard at run time: a newer explicit built-in pick
        // (or a newer event) still wins over the persisted flavour.
        if (builtinPickWins(preference, liveBuiltinPick)) return
        // Lazy registration (item JJ): the theme must exist before setTheme.
        ensureThemeRegistered(desired)
        try {
          theme.setTheme(desired)
        } catch {
          // Theme not registered yet — a later theme/change re-runs applyDesired.
        }
      })
    }

    const applyDesired = (): void => {
      // Record the built-in preference on every non-flavour observation (boot,
      // adopt() reloads, explicit Appearance changes) BEFORE any re-assert, so
      // 'off' below can hand the user back exactly what they had.
      rememberBuiltinPreference(theme.getTheme().preference)
      const desired = readFlavor()
      if (desired === 'off') {
        // The persisted choice is off — but this session may still be rendering
        // a Catppuccin flavour (another window or the settings document turned
        // it off). Hand the user back their built-in preference, exactly like
        // the row's own `select('off')` path. Gated on an EXPLICIT 'off' in
        // localStorage (audit F4): Desktop boots on an empty storage (fresh
        // random port), where the absence of a value is NOT a choice and the
        // settings document — which may legitimately restore a flavour — is
        // authoritative. Without that gate we would fight the document at every
        // Desktop boot.
        const preference = theme.getTheme().preference
        if (readExplicitFlavorOff() && flavorFromThemeId(preference) !== 'off') {
          scheduleRestore(readRestoredPreference())
        }
        return
      }
      const preference = theme.getTheme().preference
      if (preference === desired) return
      // A built-in preference only wins if the user explicitly picked it in
      // THIS session (matching liveBuiltinPick). "system" and boot/adopt()
      // values adopted from the settings document (liveBuiltinPick null) are
      // stale for the plugin — the Catppuccin row choice is newer than the
      // document's light/dark, so restore the flavour then.
      if (builtinPickWins(preference, liveBuiltinPick)) return
      scheduleRestore(desired)
    }
    applyDesired()
    const disposer = ctx.on('theme/change', applyDesired)
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== FLAVOR_STORAGE_KEY) return
      const next = readFlavor()
      if (next !== 'off') {
        ensureThemeRegistered(next)
        try {
          theme.setTheme(next)
        } catch {
          /* unknown persisted value — keep the current theme */
        }
        return
      }
      // Another window turned the flavour off (audit F4): this tab must land on
      // the built-in preference too, or it keeps rendering Catppuccin while the
      // persisted choice — and the settings row of the other window — say off.
      if (flavorFromThemeId(theme.getTheme().preference) === 'off') return
      try {
        theme.setTheme(readRestoredPreference())
      } catch {
        /* keep the current theme rather than dropping the user into nothing */
      }
    }
    window.addEventListener('storage', onStorage)

    // Any glass change (enable flag or knob) coalesces into one durable write.
    const offGlass = glass.subscribe(() => {
      queuePersist()
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
        if (!isDefaultState(local)) queuePersist()
        return
      }
      // A document holding unpersistable override entries (a hand-edited key
      // that is not a `--` token) can never compare equal to the sanitized
      // local shape, so every publish would re-run this adoption forever.
      // Adopt, then push the cleaned map back once so the document converges
      // (audit F7).
      if (hasUnpersistableOverrides((snapshot.value as { overrides?: unknown } | undefined)?.overrides)) {
        queuePersist()
      }
      // A document the user wrote wins over the local cache, but echoes of
      // our own committed writes are skipped (they equal the local state).
      if (settingsSectionsEqual(
        settingsSectionFromState(local),
        settingsSectionFromState(state),
      )) return // our own echo — nothing to adopt
      writeFlavor(state.flavor)
      glass.applyRemote(state.glass)
      writeAutoCheck(state.autoCheck)
      writeUpdateChannel(state.updateChannel)
      writeOverrides(state.overrides)
      writeShikiStyle(state.shikiStyle)
      emitPrefs()
      reapplyThemePrefs()
      applyDesired()
    }
    applyScopeSnapshot()
    const offScope = scope.subscribe(applyScopeSnapshot)

    // Auto-check (item H): warm the Host's verdict cache at boot and every
    // 6 hours while the preference is on. The row surfaces the last result
    // and the Host cache keeps re-opens instant; failures stay uncached so
    // the next cycle retries for real.
    const runAutoCheck = async (): Promise<void> => {
      try {
        const response = await fetch(`${UPDATE_ROUTE_PATH}?channel=${readUpdateChannel()}`, {
          headers: { accept: 'application/json' },
        })
        if (response.ok) lastAutoResult = await response.json() as UpdateCheckPayload
      } catch {
        /* best-effort; the row's retry discipline covers the user-visible UX */
      }
    }
    let bootTimer: number | undefined
    let intervalTimer: number | undefined
    const armAutoCheckImpl = (): void => {
      window.clearTimeout(bootTimer)
      window.clearInterval(intervalTimer)
      if (!readAutoCheck()) return
      bootTimer = window.setTimeout(() => { void runAutoCheck() }, AUTO_CHECK_BOOT_DELAY_MS)
      intervalTimer = window.setInterval(() => { void runAutoCheck() }, AUTO_CHECK_INTERVAL_MS)
    }
    armAutoCheck = armAutoCheckImpl
    armAutoCheckImpl()

    handleStaleConflict = () => applyScopeSnapshot()

    return () => {
      offScope()
      offGlass()
      disposer()
      window.removeEventListener('storage', onStorage)
      window.clearTimeout(bootTimer)
      window.clearInterval(intervalTimer)
      cancelDurablePersist()
      handleStaleConflict = undefined
      armAutoCheck = undefined
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
        queuePersist()
        return
      }
      const flavor = flavorInfo(choice)
      if (!flavor) return
      // Persist first so the restore guard (a theme/change listener) sees the
      // new flavour when setTheme below emits synchronously. Lazy
      // registration: the theme must exist before setTheme (item JJ).
      writeFlavor(flavor.themeId)
      ensureThemeRegistered(flavor.themeId)
      theme.setTheme(flavor.themeId)
      queuePersist()
    },
    overrides: overridesSnapshot,
    setOverrides: (overrides: Record<string, string>) => {
      writeOverrides(overrides)
      emitPrefs()
      reapplyThemePrefs()
      queuePersist()
    },
    shikiStyle: () => readShikiStyle(),
    setShikiStyle: (style: ShikiStyle) => {
      writeShikiStyle(style)
      emitPrefs()
      reapplyThemePrefs()
      queuePersist()
    },
    subscribePrefs: (listener: () => void) => {
      prefsListeners.add(listener)
      return () => { prefsListeners.delete(listener) }
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
    check: async (channel: UpdateChannel) => {
      try {
        const response = await fetch(`${UPDATE_ROUTE_PATH}?channel=${channel}`, { headers: { accept: 'application/json' } })
        return await response.json() as UpdateCheckPayload
      } catch {
        return { ok: false, code: 'network.local', error: 'network.local' }
      }
    },
    autoCheck: () => readAutoCheck(),
    setAutoCheck: (value: boolean) => {
      writeAutoCheck(value)
      emitPrefs()
      queuePersist()
      armAutoCheck?.() // re-arm the boot/periodic timers on toggle
    },
    channel: () => readUpdateChannel(),
    setChannel: (channel: UpdateChannel) => {
      writeUpdateChannel(channel)
      emitPrefs()
      queuePersist()
    },
    subscribePrefs: (listener: () => void) => {
      prefsListeners.add(listener)
      return () => { prefsListeners.delete(listener) }
    },
    lastAutoResult: () => lastAutoResult,
    subscribeConflict: (listener: () => void) => {
      conflictListeners.add(listener)
      return () => { conflictListeners.delete(listener) }
    },
    conflictCount: () => conflictCount,
    // Timestamps must follow the interface language, not the browser locale
    // (`toLocaleString()` with no argument silently uses the latter).
    activeLocale: () => ctx.locale.getLocale().active,
    subscribeLocale: (listener: () => void) => ctx.locale.subscribe(listener),
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'catppuccin-update',
    order: 22,
    locale: NS,
    inject: updateInjected,
  }, UpdateRow))
}