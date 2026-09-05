/**
 * TUI theme-sync half of the Catppuccin theme plugin.
 *
 * dsh-TUI has no theme registration API — custom themes are only ever read
 * from `~/.dsh-tui/themes/<name>.json` (dsh-TUI src/customTheme.ts, DATA_DIR
 * is fixed to `~/.dsh-tui` with no env override). So the "install-command"
 * experience for the TUI surface is this tiny Cordis plugin: it ships as a
 * second bundle row (`@nonamelego/dsh-catppuccin/tui-themes`, no inject,
 * activates in every profile) and idempotently copies the four Catppuccin
 * theme JSONs from this package into the TUI data dir on activation:
 *
 *   - installed into a dsh-tui profile: themes land on first TUI start —
 *     `dsh plugin --profile dsh-tui add @nonamelego/dsh-catppuccin` is the
 *     whole install;
 *   - installed into a web/desktop profile of a user who also runs dsh-TUI:
 *     themes stay in sync on every web start, no second install needed;
 *   - no `~/.dsh-tui` on disk (web-only user, headless): strict no-op — the
 *     directory is never created by this plugin.
 *
 * The `catppuccin-*.json` namespace is plugin-owned but user-visible:
 * syncing a DRIFTED owned file backs it up to `<name>.json.bak` before
 * writing the shipped copy (item R — the user's customization is never
 * silently swallowed), `preserve` leaves it alone, `overwrite` restores the
 * historical force-sync behavior; other files in the themes directory are
 * never touched. Community/third-party themes (item T) live in the
 * `catppuccin-community/` subdirectory and are synced write-if-missing —
 * existing themes are never overwritten.
 *
 * Best-effort by contract: any failure is swallowed silently — theme sync
 * must never drag down profile startup (stdout stays quiet during TUI
 * sessions, so no logging here either).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Stable cordis plugin name (matches the cordis.patch.yml row id). */
export const name = 'dsh-catppuccin-tui-themes'

/** File name shape this plugin owns and syncs. */
function isOwnedTheme(file: string): boolean {
  return file.startsWith('catppuccin-') && file.endsWith('.json')
}

/** Sync behavior for an owned file that differs from the shipped copy. */
export type TuiThemeConflict = 'overwrite' | 'preserve' | 'backup'

/** Options for {@link syncTuiThemes}. */
export interface SyncTuiThemesOptions {
  /** How to treat a drifted owned file (item R). Default `backup`:
   *  the existing file is copied to `<name>.json.bak` and the shipped copy
   *  is written — the user's customization survives and is recoverable.
   *  `preserve` keeps the user's file (manifest updates wait for the next
   *  sync), `overwrite` restores the historical force-sync behavior. */
  onConflict?: TuiThemeConflict
  /** Report-only mode (item S): returns the planned writes without
   *  touching the disk (no directories created, no backups taken). */
  dryRun?: boolean
  /** Community theme directory (item T): JSON files there are synced
   *  write-if-missing into the themes dir — existing files are NEVER
   *  overwritten, so user/third-party themes win over the community copy.
   *  Absent directory = nothing to sync. */
  communityDir?: string
}

/**
 * Idempotently copy every `catppuccin-*.json` from `bundledDir` into
 * `<tuiHome>/themes/`, then (with a `communityDir`) any missing community
 * JSON. Owned files are compared against the shipped copy and synced on
 * drift according to `onConflict`; nothing outside the owned namespace is
 * touched; community themes are write-if-missing only. Returns the files
 * written (or, under `dryRun`, the files that WOULD be written) — empty =
 * already in sync, or `tuiHome` absent (the sync no-ops unless the user
 * actually has a dsh-TUI data dir). Pure fs, no logging, never throws out
 * of the caller's try-wrap.
 */
export function syncTuiThemes(
  bundledDir: string,
  tuiHome: string,
  options: SyncTuiThemesOptions = {},
): string[] {
  if (!existsSync(tuiHome) || !statSync(tuiHome).isDirectory()) return []
  const { onConflict = 'backup', dryRun = false, communityDir } = options
  const written: string[] = []
  let targetReady = false
  const ensureTarget = (): void => {
    if (!targetReady) {
      mkdirSync(join(tuiHome, 'themes'), { recursive: true })
      targetReady = true
    }
  }
  for (const file of readdirSync(bundledDir).sort()) {
    if (!isOwnedTheme(file)) continue
    const source = readFileSync(join(bundledDir, file))
    const dest = join(tuiHome, 'themes', file)
    let identical = false
    try {
      identical = readFileSync(dest).equals(source)
    } catch {
      identical = false // missing or unreadable target → (re)write it
    }
    if (identical) continue
    if (onConflict === 'preserve' && existsSync(dest)) continue
    if (!dryRun) {
      ensureTarget()
      if (onConflict === 'backup' && existsSync(dest) && statSync(dest).isFile()) {
        // One .bak per theme, refreshed on every conflict (the user's
        // customization is never lost, only rolled forward).
        copyFileSync(dest, `${dest}.bak`)
      }
      writeFileSync(dest, source)
    }
    written.push(file)
  }
  if (communityDir !== undefined && existsSync(communityDir) && statSync(communityDir).isDirectory()) {
    for (const file of readdirSync(communityDir).sort()) {
      if (!file.endsWith('.json')) continue
      const dest = join(tuiHome, 'themes', file)
      if (existsSync(dest)) continue // never overwrite an existing theme
      if (!dryRun) {
        ensureTarget()
        writeFileSync(dest, readFileSync(join(communityDir, file)))
      }
      written.push(file)
    }
  }
  return written
}

/** Cordis entry: sync once at activation. No inject — must activate in any
 *  profile (dsh-tui has no webServer; the main half waits there instead). */
export function apply(): void {
  try {
    // lib/tui-themes.js -> <package root>/themes (shipped via package.json
    // "files"; same layout under a link: dev install).
    const bundledDir = fileURLToPath(new URL('../themes', import.meta.url))
    const tuiHome = join(homedir(), '.dsh-tui')
    syncTuiThemes(bundledDir, tuiHome, {
      // Community themes: ~/.dsh-tui/themes/catppuccin-community/ (item T).
      communityDir: join(tuiHome, 'themes', 'catppuccin-community'),
    })
  } catch {
    // Best-effort: never disturb profile startup for a theme copy.
  }
}