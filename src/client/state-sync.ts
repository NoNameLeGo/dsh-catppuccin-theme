/**
 * Browser half of the durable Catppuccin state — a thin wrapper over the
 * Host's `/catppuccin/state` route (same-origin relative fetch, so it works on
 * DSH Desktop's per-launch random loopback port). The Host file is the source
 * of truth; this module adds the fetch wrapper plus a debounced trailing
 * writer so rapid knob drags coalesce into a single PUT. Every failure is
 * non-fatal: the plugin keeps working from browser localStorage alone.
 */
import { STATE_ROUTE_PATH, sanitizeState, type CatppuccinState } from '../state.ts'

/** Outcome of reading the durable state from the Host. */
export interface DurableReadResult {
  /** Whether the route answered at all (false = fall back to localStorage-only). */
  available: boolean
  /** The stored state, or null when nothing durable has been written yet. */
  state: CatppuccinState | null
}

/** Read the durable state from the Host file (same-origin GET). */
export async function readDurableStateRemote(): Promise<DurableReadResult> {
  try {
    const response = await fetch(STATE_ROUTE_PATH, { headers: { accept: 'application/json' } })
    if (!response.ok) return { available: false, state: null }
    const payload = await response.json() as { ok?: boolean; state?: unknown }
    if (payload.ok !== true) return { available: false, state: null }
    return { available: true, state: payload.state === null || payload.state === undefined
      ? null
      : sanitizeState(payload.state) }
  } catch {
    return { available: false, state: null }
  }
}

/** Write the durable state to the Host file (same-origin PUT). */
export async function persistDurableState(state: CatppuccinState): Promise<boolean> {
  try {
    const response = await fetch(STATE_ROUTE_PATH, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(sanitizeState(state)),
    })
    return response.ok
  } catch {
    return false
  }
}

let pendingTimer: number | undefined
let pendingGetState: (() => CatppuccinState) | undefined

/**
 * Debounced trailing persist: after a burst of changes (a slider drag emits a
 * stream of snapshot updates) the latest state is written to the Host once,
 * a short beat after the last change. Pass an accessor so the snapshot is
 * taken at flush time, never stale.
 */
export function scheduleDurablePersist(getState: () => CatppuccinState, delayMs = 300): void {
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
  pendingGetState = getState
  pendingTimer = window.setTimeout(() => {
    pendingTimer = undefined
    const state = pendingGetState
    pendingGetState = undefined
    if (state !== undefined) void persistDurableState(state()).catch(() => { /* best-effort */ })
  }, delayMs)
}

/** Drop any queued persist (plugin unload / page teardown). */
export function cancelDurablePersist(): void {
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
  pendingTimer = undefined
  pendingGetState = undefined
}
