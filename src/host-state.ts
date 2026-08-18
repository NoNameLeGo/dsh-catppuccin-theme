/**
 * Host-side durable store for the Catppuccin state — a tiny JSON file under
 * the DSH home, written atomically (temp file + rename + read-back verify)
 * exactly the way DSH Desktop's skin-state store writes `cordis.patch.yml`.
 * The file is port-independent, so it survives DSH Desktop's random
 * per-launch loopback port where browser localStorage (scoped per origin,
 * including the port) always starts empty. The four flavour themes and the
 * glass layer are still applied by the Client; this module only persists the
 * choice durably and answers the JSON contract in `src/state.ts`.
 *
 * Host-only module (node:fs / node:path / node:os resolve at runtime in the
 * DSH process); the Client never sees it.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { defaultDshHome } from './profile-detect.ts'
import { STATE_FILENAME, sanitizeState, type CatppuccinState } from './state.ts'

/** Absolute path of the durable state file under a DSH home. */
export function stateFilePath(home = defaultDshHome()): string {
  return join(home, STATE_FILENAME)
}

/** Read the durable state; absent or unparseable input means none yet. */
export function readDurableState(home = defaultDshHome()): CatppuccinState | null {
  try {
    return sanitizeState(JSON.parse(readFileSync(stateFilePath(home), 'utf8')))
  } catch {
    // Missing file (first run) or a corrupt/partial write — no durable state.
    return null
  }
}

/**
 * Write the state atomically: temp file in a sibling temp dir, chmod to the
 * existing file's mode (or 0600), rename over the target, then verify the
 * read-back equals what we wrote. Mirrors the Desktop's proven skin-state
 * writer (a failed rename leaves the previous file intact).
 */
export function writeDurableState(state: CatppuccinState, home = defaultDshHome()): void {
  const path = stateFilePath(home)
  const parent = dirname(path)
  mkdirSync(parent, { recursive: true })
  let mode = 0o600
  try {
    mode = statSync(path).mode & 0o777
  } catch {
    // First write — the 0600 default keeps the preference file private.
  }
  const content = `${JSON.stringify(sanitizeState(state), null, 2)}\n`
  const tempDir = mkdtempSync(join(parent, `${basename(path)}.tmp-`))
  const temporary = join(tempDir, basename(path))
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    chmodSync(temporary, mode)
    renameSync(temporary, path)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
  if (readFileSync(path, 'utf8') !== content) {
    throw new Error(`catppuccin state: write verification failed: ${path}`)
  }
}
