/**
 * Browser half of the durable Catppuccin state — an adapter over BOTH shapes
 * of the OFFICIAL settings seam, replacing the pre-0.5.0 `/catppuccin/state`
 * route wrapper.
 *
 * The seam changed shape in DSH 0.1.7-alpha.1 (issue #15) and both shapes are
 * in the wild (`latest` = 0.1.5-rc.3 on the old one, `next` = 0.1.7-rc.1 on
 * the new one), so this module binds whichever the host serves:
 *
 *  - `ctx.configForms` (>= 0.1.7-alpha.1): the plugin's volatile `Config`
 *    projected into a form keyed by the PROFILE ENTRY id, addressed through
 *    `configForms.get(CATPPUCCIN_ENTRY_ID)`.
 *  - `ctx.settingsScope` (<= 0.1.6-alpha.2): a namespace the Host half
 *    registered, bound with `settingsScope.bind({ namespace })`.
 *
 * The two are not alike at the type level, but their SNAPSHOTS are
 * field-for-field identical (`status / value / base / user / revision /
 * writable / mode`), so one {@link DurableScope} interface covers both. Their
 * three behavioural differences are confined INSIDE the channel objects and
 * are deliberately not reachable by callers:
 *
 *  1. "no user layer yet" — the new form's `user` is the profile patch's
 *     `override`, which defaults to `{}` (so `!== undefined` never fires
 *     there); the legacy document omits the field entirely when it holds no
 *     such section. → {@link DurableScope.hasUserLayer}.
 *  2. the write fence — the new controller forwards `expectedRevision` and
 *     reports a refusal as `false`; the legacy one resolves it as
 *     `pendingRevision ?? snapshot.revision` and reports refusal as a SILENT
 *     resolve, so forwarding an older base there would turn a write that
 *     succeeds today into an invisible loss. → {@link DurableScope.write}.
 *  3. the refusal signal — only the new channel can report `refused`; the
 *     legacy one cannot, which is why the read-side revision guard in
 *     {@link persistStateToScope} must stay in place for BOTH channels.
 *
 * Every failure is still non-fatal: the plugin keeps working from browser
 * localStorage alone (the in-browser cache), losing only cross-restart
 * durability on profiles where the settings transport is absent or
 * process-local.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the configForms Context merge and the form contract.
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CATPPUCCIN_ENTRY_ID,
  CATPPUCCIN_SETTINGS_NS,
  hasUserLayerSection,
  settingsSectionFromState,
  settingsSectionsEqual,
  stateFromSettingsSection,
  type CatppuccinSettingsSection,
  type CatppuccinState,
} from '../state.ts'

/** Client-side sync state of one settings namespace — the SHARED shape of
 *  both seams (`ConfigFormSnapshot` on 0.1.7+, the scope snapshot before it;
 *  the fields agree one for one, which is what makes the adapter possible). */
export interface DurableSnapshot<T> {
  /** `loading` until the first accepted section, `ready` while one stands,
   *  `unavailable` when the namespace is not exposed to this client or the
   *  connection keeps preferences process-local (memory mode). */
  status: 'loading' | 'ready' | 'unavailable'
  /** Last accepted schema-resolved section. */
  value: T | undefined
  /** Composition layer the Host resolved {@link value} over. */
  base: unknown
  /** Raw user layer as stored, when one exists. */
  user: unknown
  /** Revision fencing the next write. */
  revision: number | undefined
  /** Whether the Host document accepts writes; memory mode never does. */
  writable: boolean
  /** `host` syncs with the Host document; `memory` keeps a remote browser
   *  process-local. */
  mode: 'host' | 'memory'
}

/** How one write ended. `refused` is only observable on the new channel. */
export type WriteOutcome = 'accepted' | 'refused' | 'failed'

/** One settings channel: everything the two seams disagree about lives here. */
export interface DurableScope<T> {
  /** Which seam answered — diagnostics and test assertions only. */
  readonly kind: 'configForms' | 'settingsScope' | 'none'
  getSnapshot(): DurableSnapshot<T>
  subscribe(listener: () => void): () => void
  /** Whether the durable store already holds a user layer. The predicate is
   *  per-channel on purpose (see difference 1 in the module header). */
  hasUserLayer(snapshot: DurableSnapshot<T>): boolean
  /** Issue one atomic write. Whether {@link baseRevision} becomes the Host's
   *  fence is the channel's decision, never the caller's (difference 2). */
  write(ops: readonly SettingsPathOpView[], baseRevision: number | undefined): Promise<WriteOutcome>
}

/** The snapshot an unbound scope reports: the pre-0.5.0 "transport absent"
 *  degradation, where localStorage is the only store. */
const UNBOUND_SNAPSHOT: DurableSnapshot<never> = {
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
}

/** Whether the scope is usable for durable persistence: the document is
 *  resolved (`ready`) and the Host persistence is active (`host`). A `memory`
 *  scope (non-loopback pages / absent transport) or a not-yet-ready one is
 *  NOT usable — the caller keeps localStorage as the only store. */
export function isScopeUsable(snapshot: DurableSnapshot<unknown>): boolean {
  return snapshot.status === 'ready' && snapshot.mode === 'host'
}

/** The local state contract (with the synthetic `version`) for a usable
 *  scope snapshot; `null` while the section is not resolved. */
export function durableStateFromSnapshot(
  snapshot: DurableSnapshot<CatppuccinSettingsSection>,
): CatppuccinState | null {
  if (!isScopeUsable(snapshot) || snapshot.value === undefined) return null
  return stateFromSettingsSection(snapshot.value)
}

/** The NEW seam's channel (DSH >= 0.1.7-alpha.1). */
function configFormsScope(
  form: ConfigForm<CatppuccinSettingsSection>,
): DurableScope<CatppuccinSettingsSection> {
  return {
    kind: 'configForms',
    getSnapshot: () => form.getSnapshot() as ConfigFormSnapshot<CatppuccinSettingsSection>,
    subscribe: (listener) => form.subscribe(listener),
    // The form's `user` is the profile patch's `override`, which the Host
    // defaults to `{}` — so an EMPTY OBJECT is what "no user layer yet" looks
    // like here, and it must not be mistaken for a real user layer.
    hasUserLayer: (snapshot) => hasUserLayerSection(snapshot.user),
    write: async (ops, baseRevision) => {
      try {
        // The returned boolean is the only refusal signal any seam gives us;
        // a transport failure rejects instead.
        return await form.mutate(ops, baseRevision) ? 'accepted' : 'refused'
      } catch {
        return 'failed'
      }
    },
  }
}

/**
 * The LEGACY seam's surface (DSH <= 0.1.6-alpha.2). Declared structurally
 * because 0.1.7 removed it from the published types while this plugin still
 * has to run on hosts that only have it, and reaching for `any` would hide a
 * real shape change.
 */
interface LegacyScope<T> {
  getSnapshot(): DurableSnapshot<T>
  subscribe(listener: () => void): () => void
  /** Note the absent `expectedRevision`: the legacy controller resolves the
   *  fence itself (`pendingRevision ?? snapshot.revision`). */
  mutate(ops: readonly SettingsPathOpView[]): Promise<void>
}
interface LegacyScopeBinder {
  bind<T>(spec: { namespace: string }): LegacyScope<T>
}

/** The LEGACY seam's channel (DSH <= 0.1.6-alpha.2). */
function legacyScope(scope: LegacyScope<CatppuccinSettingsSection>): DurableScope<CatppuccinSettingsSection> {
  return {
    kind: 'settingsScope',
    getSnapshot: () => scope.getSnapshot(),
    subscribe: (listener) => scope.subscribe(listener),
    // The legacy document maps over the namespaces it has a section for, so
    // "no user layer" is an ABSENT field — the predicate 0.5.x shipped.
    hasUserLayer: (snapshot) => snapshot.user !== undefined,
    write: async (ops) => {
      try {
        // NO baseRevision on purpose: the legacy controller resolves the fence
        // itself and therefore retries with the newer revision. Forwarding our
        // older base would make a write that succeeds today fail — and that
        // failure is unobservable (the controller resolves it silently), so we
        // would not even notice.
        await scope.mutate(ops)
        return 'accepted'
      } catch {
        return 'failed'
      }
    },
  }
}

/**
 * Bind whichever settings channel this host serves, late and without blocking.
 *
 * Both bindings ride OPTIONAL injections: a service the deployment never
 * provides simply never fires its callback (it does not hold the plugin
 * back), and the two names cannot both be live in one host — 0.1.7-alpha.1
 * removed `settingsScope` from the service set, and 0.1.6 and earlier know
 * nothing of `configForms`. Until one binds, the scope reports the unbound
 * snapshot and every write short-circuits, which is exactly the
 * "settings transport unavailable" degradation the rows already handle.
 * @param ctx - client root context.
 * @returns the scope facade, bound for the lifetime of the caller's fiber.
 */
export function createDurableScope(ctx: Context): DurableScope<CatppuccinSettingsSection> {
  let current: DurableScope<CatppuccinSettingsSection> | undefined
  let offBound: (() => void) | undefined
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const attach = (next: DurableScope<CatppuccinSettingsSection> | undefined): void => {
    if (next === current) return
    offBound?.()
    current = next
    offBound = next?.subscribe(notify)
    // Re-run hydration/adoption: the durable state may only become readable
    // once a late-arriving service publishes its first snapshot.
    notify()
  }

  ctx.inject(['configForms'], (formsCtx) => {
    attach(configFormsScope(formsCtx.configForms.get<CatppuccinSettingsSection>(CATPPUCCIN_ENTRY_ID)))
    return () => { attach(undefined) }
  })
  ctx.inject(['settingsScope'], (legacyCtx) => {
    // `settingsScope` is not part of the 0.1.7 Context merge (the service is
    // gone there), so the legacy lookup is narrowed explicitly.
    const binder = (legacyCtx as unknown as { settingsScope?: LegacyScopeBinder }).settingsScope
    if (binder !== undefined) {
      attach(legacyScope(binder.bind<CatppuccinSettingsSection>({ namespace: CATPPUCCIN_SETTINGS_NS })))
    }
    return () => { attach(undefined) }
  })

  return {
    get kind() { return current?.kind ?? 'none' },
    getSnapshot: () => current?.getSnapshot()
      ?? UNBOUND_SNAPSHOT as DurableSnapshot<CatppuccinSettingsSection>,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    // Never reached while unbound: the caller bails out in
    // `durableStateFromSnapshot` before asking.
    hasUserLayer: (snapshot) => current?.hasUserLayer(snapshot) ?? false,
    write: async (ops, baseRevision) => current?.write(ops, baseRevision) ?? 'failed',
  }
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
 * The WRITE side is revision-fenced by the channel, so no optimistic locking
 * is re-built here. What a fence cannot see is a STALE LOCAL VIEW: tab A reads
 * an old localStorage value, the user changes flavour, and the debounced flush
 * writes that old-based state over tab B's already-committed newer choice.
 * This guard is also the ONLY conflict detector the legacy seam can offer —
 * that seam resolves a refused write silently, so without it a concurrent edit
 * would be lost without a trace.
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
  scope: DurableScope<CatppuccinSettingsSection>,
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
  const outcome = await scope.write(stateToMutateOps(state), baseRevision)
  if (outcome === 'accepted') return 'written'
  // A refusal means the Host's document moved past what this state was derived
  // from — the same condition the read-side guard above reports. The channel
  // has already re-read the Host state, so the caller can adopt it and tell
  // the row about the conflict.
  if (outcome === 'refused') return 'stale'
  return 'error'
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
