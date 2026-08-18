/**
 * Runtime probe of the DSH profile this plugin is installed into.
 *
 * Borrowed from dsh-vision-toolkit's plugin-update module (MIT) and trimmed
 * to what the update check needs: instead of hard-coding a profile name into
 * the upgrade command, the Host scans the DSH home's `profiles/` directory
 * (plus the `--profile` argv hint) for the profile whose package.json lists
 * this package as a direct dependency, and classifies the install source so
 * the Client can tell "registry install → copy the npm command" apart from
 * "local link/file/git install → the npm command does not apply".
 *
 * Pure functions (`profileHint`, `isRegistrySpec`, `installSourceOf`) are
 * dependency-free and unit-tested; the IO probe (`detectProfile`) reads only
 * package.json manifests and never mutates anything.
 */
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallSource } from './update-check.ts'
import { PACKAGE_NAME } from './update-check.ts'

/** Fallback profile name when nothing can be probed (keeps the command valid). */
export const FALLBACK_PROFILE = 'web'

/** The DSH home the running process owns — `$DSH_HOME` when set, else
 *  `~/.dsh`. Port-independent and stable across restarts, so it is the right
 *  root for the plugin's durable state file. */
export function defaultDshHome(): string {
  return process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
}

/** How this package's dependency spec was written in the profile manifest. */
export interface ProfileProbe {
  /** Profile name to target in the upgrade command. */
  name: string
  /** Whether the probe actually matched a profile (false = fallback). */
  detected: boolean
  /** Install source classification of this package in that profile. */
  installSource: InstallSource
}

/**
 * Extract the profile name a running DSH process was started with: either a
 * leading bare `web`-style argument or an explicit `--profile <name>` /
 * `--profile=<name>` flag. Mirrors vision-toolkit's `profileHint`.
 */
export function profileHint(argv: readonly string[]): string | undefined {
  if (argv[0] === 'web') return 'web'
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value?.startsWith('--profile=')) return value.slice('--profile='.length)
    if (value === '--profile') return argv[index + 1]
  }
  return undefined
}

/**
 * Whether a dependency spec is a plain npm registry spec (a semver range),
 * not a local/workspace/git/URL source. Mirrors vision-toolkit's
 * `registryInstallSpec`.
 */
export function isRegistrySpec(spec: string): boolean {
  const normalized = spec.trim().toLowerCase()
  return normalized.length > 0
    && !normalized.startsWith('workspace:')
    && !/^[a-z][a-z0-9+.-]*:/u.test(normalized)
    && !normalized.includes('/')
    && !normalized.includes('\\')
}

/** Classify a non-registry spec into the more precise local source kind. */
export function installSourceOf(spec: string): InstallSource {
  const normalized = spec.trim().toLowerCase()
  if (normalized.startsWith('link:') || normalized.startsWith('workspace:')) return 'link'
  if (normalized.startsWith('file:')) return 'file'
  return 'git'
}

/** Read one profile's manifest at its manifest dir and return this package's install source. */
async function inspectProfileAt(manifestDir: string): Promise<InstallSource | undefined> {
  try {
    const manifest = JSON.parse(
      await readFile(join(manifestDir, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, unknown> }
    const spec = manifest.dependencies?.[PACKAGE_NAME]
    if (typeof spec !== 'string') return undefined
    return isRegistrySpec(spec) ? 'registry' : installSourceOf(spec)
  } catch {
    return undefined
  }
}

/** Read one profile under the DSH home and return this package's install source. */
async function inspectProfile(dshHome: string, name: string): Promise<InstallSource | undefined> {
  return inspectProfileAt(join(dshHome, 'profiles', name))
}

/** The launcher-resolved profile under DSH Desktop (`desktopProfiles.current`). */
export interface DesktopProfileHint {
  /** Launcher-selected profile name. */
  name: string
  /** Absolute manifest dir; falls back to the DSH-home scan path when absent. */
  dir?: string
}

/**
 * Probe the DSH profile this package is installed into.
 * Priority: an authoritative `desktopProfile` (DSH Desktop's
 * `desktopProfiles.current` — the Desktop docs say never infer the profile
 * from argv / settings / `$DSH_HOME` when it is available), then the
 * `--profile`/bare-name argv hint, then a scan of every `profiles/` entry
 * whose manifest lists this package as a direct dependency. Falls back to
 * `FALLBACK_PROFILE` with `detected: false` when nothing matches (e.g. a dev
 * install outside any profile).
 */
export async function detectProfile(options: {
  /** DSH home; defaults to $DSH_HOME or `~/.dsh`. */
  dshHome?: string
  /** Process argv slice; defaults to the running process's argv. */
  argv?: readonly string[]
  /** Authoritative profile under DSH Desktop (`desktopProfiles.current`), when running there. */
  desktopProfile?: DesktopProfileHint | undefined
} = {}): Promise<ProfileProbe> {
  const dshHome = options.dshHome ?? defaultDshHome()
  const argv = options.argv ?? process.argv.slice(2)

  // DSH Desktop wins over every probe: the launcher already resolved the
  // active profile, so the upgrade command targets it directly. The install
  // source still comes from reading that profile's manifest (via its explicit
  // dir) so the "npm command does not apply" local-install hint keeps working.
  const desktop = options.desktopProfile
  if (desktop?.name) {
    const dir = desktop.dir?.trim() || join(dshHome, 'profiles', desktop.name)
    const source = await inspectProfileAt(dir)
    return { name: desktop.name, detected: true, installSource: source ?? 'unknown' }
  }

  const hint = profileHint(argv)

  if (hint !== undefined) {
    const source = await inspectProfile(dshHome, hint)
    if (source !== undefined) return { name: hint, detected: true, installSource: source }
  }

  const profilesDir = join(dshHome, 'profiles')
  let names: string[] = []
  try {
    names = (await readdir(profilesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    // No profiles directory — the fallback below still produces a valid command.
  }
  if (hint !== undefined && !names.includes(hint)) names.push(hint)

  for (const name of names) {
    const source = await inspectProfile(dshHome, name)
    if (source !== undefined) return { name, detected: true, installSource: source }
  }

  return { name: hint ?? FALLBACK_PROFILE, detected: false, installSource: 'unknown' }
}