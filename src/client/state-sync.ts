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
  settingsSectionsEqual,
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
    { op: 'set', path: ['autoCheck'], value: section.autoCheck },
    { op: 'set', path: ['updateChannel'], value: section.updateChannel },
    { op: 'set', path: ['overrides'], value: section.overrides },
    { op: 'set', path: ['shikiStyle'], value: section.shikiStyle },
  ]
}

/** Outcome of one durable persist attempt (item C/X). */
export type PersistOutcome =
  /** The mutation was issued (the Host may still fence-stall it later). */
  | 'written'
  /** The local state already equals the document — nothing to write. */
  | 'noop'
  /** The document moved past the revision the local state was derived from:
   *  the local change is a stale write-back and was NOT written — the
   *  remote (newer) state wins and the caller should adopt it + notify. */
  | 'stale'
  /** The write failed (transport error / rejected mutation). */
  | 'error'

/**
 * Read-side consistency guard for the durable persist (items C/X).
 *
 * The WRITE side is already revision-fenced by `scope.mutate(...)` (the
 * Host rejects an outdated revision), so no optimistic locking is re-built
 * here. What the fence cannot see is a STALE LOCAL VIEW: tab A reads an old
 * localStorage value, the user changes flavour, and the debounced flush
 * writes that old-based state over tab B's already-committed newer choice.
 *
 * The guard compares the revision the local state was derived from
 * (`baseRevision`, captured at schedule time) with the snapshot revision at
 * flush time:
 *  - equal → the document did not move while we were debouncing → write.
 *  - moved, and the remote section equals our own last written section →
 *    the movement is our own write's echo, safe to write the newer change.
 *  - moved otherwise → an external edit landed mid-debounce; the local
 *    change is stale, so it is abandoned and `stale` is returned so the
 *    caller can adopt the remote state and surface the conflict.
 * Also returns `noop` when the local state already equals the document
 * (the normal echo back of our own committed writes; previously this wrote
 * a redundant identical mutation).
 */
export async function persistStateToScope(
  scope: SettingsScope<CatppuccinSettingsSection>,
  state: CatppuccinState,
  options: {
    /** Snapshot revision the local state was derived from (captured at
     *  schedule time). Omit to skip the read-side guard entirely. */
    baseRevision?: number | undefined
    /** Section of the last successfully issued write (our own echo
     *  fingerprint — revision movement matching it is not a conflict). */
    lastWrittenSection?: CatppuccinSettingsSection | undefined
  } = {},
): Promise<PersistOutcome> {
  try {
    const snapshot = scope.getSnapshot()
    if (!isScopeUsable(snapshot)) return 'error'
    const remote = durableStateFromSnapshot(snapshot)
    const localSection = settingsSectionFromState(state)
    if (remote !== null && settingsSectionsEqual(settingsSectionFromState(remote), localSection)) {
      return 'noop'
    }
    const { baseRevision, lastWrittenSection } = options
    if (baseRevision !== undefined && snapshot.revision !== undefined && snapshot.revision !== baseRevision) {
      const ourOwnEcho = lastWrittenSection !== undefined
        && remote !== null
        && settingsSectionsEqual(settingsSectionFromState(remote), lastWrittenSection)
      if (!ourOwnEcho) return 'stale'
    }
    await scope.mutate(stateToMutateOps(state))
    return 'written'
  } catch {
    return 'error'
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

/**
 * Capture-once holder for the revision a debounced write is based on (audit
 * F2, 2026-09-22).
 *
 * The read-side guard in {@link persistStateToScope} only means anything if
 * `baseRevision` is the revision the LOCAL state was derived from — i.e.
 * sampled when the change was SCHEDULED. Reading it inside the flush instead
 * made the comparison a tautology: the flush and the guard's own
 * `scope.getSnapshot()` run in the same synchronous block, so the two
 * revisions are always equal and `'stale'` is unreachable. The effect was a
 * silently lost read-side protection: with two windows open, an external edit
 * landing inside the 300 ms debounce window was overwritten by the stale local
 * state and the conflict banner never appeared.
 *
 * `capture` keeps the FIRST revision of a burst (`??=`, not assignment): a
 * slider drag emits several changes, and the local state each of them is based
 * on is still the one that was current when the burst started. `take` clears
 * the slot as it reads, so the next burst starts fresh — including when the
 * flush bails out (unusable scope), where the value must not leak forward.
 */
export function createBaseRevisionTracker(): {
  /** Sample the base revision once per burst (later calls in the same burst are no-ops). */
  capture: (read: () => number | undefined) => void
  /** Consume the captured revision (undefined when the burst never captured one). */
  take: () => number | undefined
} {
  let pending: number | undefined
  return {
    capture(read) {
      if (pending === undefined) pending = read()
    },
    take() {
      const value = pending
      pending = undefined
      return value
    },
  }
}