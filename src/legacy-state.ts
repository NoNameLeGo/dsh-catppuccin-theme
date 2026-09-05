/**
 * Legacy durable-state read — the one-shot migration source for 0.5.0.
 *
 * Up to 0.4.x the plugin persisted its state in a small JSON file under the
 * DSH home (`catppuccin-state.json`), served to the Client through the
 * `/catppuccin/state` route. 0.5.0 migrates persistence to the official
 * settings seam (`ctx.settings` / `ctx.settingsScope`), which is durable
 * across DSH Desktop's per-launch random loopback ports just like the file
 * was. The legacy file is READ-ONLY here: 0.5.0 migrates its content into
 * the settings document once and keeps the file on disk as a rollback copy
 * (an affected user can restore their old state by hand from it).
 *
 * Host-only module (node:fs / node:path resolve at runtime in the DSH
 * process); the Client never sees it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultDshHome } from './profile-detect.ts'
import { STATE_FILENAME, sanitizeState, type CatppuccinState } from './state.ts'

/** Absolute path of the legacy state file under a DSH home. */
export function legacyStateFilePath(home = defaultDshHome()): string {
  return join(home, STATE_FILENAME)
}

/** Read the legacy durable state; absent or unparseable input means none yet. */
export function readLegacyState(home = defaultDshHome()): CatppuccinState | null {
  try {
    return sanitizeState(JSON.parse(readFileSync(legacyStateFilePath(home), 'utf8')))
  } catch {
    // Missing file (fresh install or a user who never wrote state) or a
    // corrupt/partial write — nothing to migrate.
    return null
  }
}