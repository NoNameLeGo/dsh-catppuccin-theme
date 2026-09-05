/**
 * Browser half of the durable Catppuccin state — an adapter over the
 * OFFICIAL settings scope (`ctx.settingsScope`), replacing the pre-0.5.0
 * `/catppuccin/state` route wrapper. The Host settings document is the source
 * of truth; this module binds the `catppuccin` namespace, reads its resolved
 * section into the local state contract, and persists changes as one atomic
 * revision-fenced mutation. Every failure is non-fatal: the plugin keeps
 * working from browser localStorage alone (the in-browser cache), losing
 * only cross-restart durability on profiles where the settings transport is
 * absent or process-local.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the settingsScope Context merge and the scope contract
// types (SettingsScope / SettingsScopeSnapshot).
import type {
  SettingsScope,
  SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CATPPUCCIN_SETTINGS_NS,
  settingsSectionFromState,
  stateFromSettingsSection,
  type CatppuccinSettingsSection,
  type CatppuccinState,
} from '../state.ts'

export type { SettingsScope, SettingsScopeSnapshot }

/**
 * Bind the Catppuccin namespace on this context. The scope derives from the
 * shared document mirror (no wire read of its own) and its life is bound to
 * the calling fiber, so binding never blocks on the settings transport.
 */
export function bindCatppuccinScope(ctx: Context): SettingsScope<CatppuccinSettingsSection> {
  return ctx.settingsScope.bind<CatppuccinSettingsSection>({ namespace: CATPPUCCIN_SETTINGS_NS })
}

/** Whether the scope is usable for durable persistence: the document is
 *  resolved (`ready`) and the Host persistence is active (`host`). A `memory`
 *  scope (non-loopback pages / absent transport) or a not-yet-ready one is
 *  NOT usable — the caller keeps localStorage as the only store. */
export function isScopeUsable(snapshot: SettingsScopeSnapshot<CatppuccinSettingsSection>): boolean {
  return snapshot.status === 'ready' && snapshot.mode === 'host'
}

/** The local state contract (with the synthetic `version`) for a usable
 *  scope snapshot; `null` while the section is not resolved. */
export function durableStateFromSnapshot(
  snapshot: SettingsScopeSnapshot<CatppuccinSettingsSection>,
): CatppuccinState | null {
  if (!isScopeUsable(snapshot) || snapshot.value === undefined) return null
  return stateFromSettingsSection(snapshot.value)
}

/** One atomic mutation covering the whole local state (revision-fenced).
 *  Writing every field keeps the section self-contained — a partial write
 *  could otherwise leave a knob stuck on a stale override after a document
 *  edit elsewhere. */
function stateToMutateOps(state: CatppuccinState): SettingsPathOpView[] {
  const section = settingsSectionFromState(state)
  return [
    { op: 'set', path: ['flavor'], value: section.flavor },
    { op: 'set', path: ['glass', 'enabled'], value: section.glass.enabled },
    { op: 'set', path: ['glass', 'mode'], value: section.glass.mode },
    { op: 'set', path: ['glass', 'blur'], value: section.glass.blur },
    { op: 'set', path: ['glass', 'frost'], value: section.glass.frost },
    { op: 'set', path: ['glass', 'brightness'], value: section.glass.brightness },
  ]
}

/** Persist the local state through the scope as one atomic mutation.
 *  Resolves `true` when the write was issued. */
export async function persistStateToScope(
  scope: SettingsScope<CatppuccinSettingsSection>,
  state: CatppuccinState,
): Promise<boolean> {
  try {
    await scope.mutate(stateToMutateOps(state))
    return true
  } catch {
    return false
  }
}

let pendingTimer: number | undefined
let pendingWrite: (() => void) | undefined

/**
 * Debounced trailing persist: after a burst of changes (a slider drag emits a
 * stream of snapshot updates) the write happens once, a short beat after the
 * last change. Pass an accessor so the state snapshot is taken at flush time,
 * never stale.
 */
export function scheduleDurablePersist(write: () => void, delayMs = 300): void {
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
  pendingWrite = write
  pendingTimer = window.setTimeout(() => {
    pendingTimer = undefined
    const run = pendingWrite
    pendingWrite = undefined
    if (run !== undefined) void Promise.resolve().then(run).catch(() => { /* best-effort */ })
  }, delayMs)
}

/** Drop any queued persist (plugin unload / page teardown). */
export function cancelDurablePersist(): void {
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
  pendingTimer = undefined
  pendingWrite = undefined
}