/**
 * Shared contract of the update-check feature — consumed by both halves:
 * the Host registers an exact webServer route answering this JSON payload,
 * and the Client settings row fetches that same-origin route and renders it.
 * This module is dependency-free so both bundles inline it.
 */
import { compareVersions, parseVersion } from './versions.ts'

/** The plugin's own npm name (the registry lookup key). */
export const PACKAGE_NAME = '@nonamelego/dsh-catppuccin'

/**
 * npm registry abbreviated packument endpoint (the `install-v1` document).
 * The `latest` endpoint alone is not enough: this project ships prereleases
 * under the `beta` dist-tag while `latest` stays on the last stable, so the
 * check reads `dist-tags` to serve both channels.
 */
export const REGISTRY_PACKUMENT_URL =
  `https://registry.npmjs.org/${PACKAGE_NAME.replace('/', '%2F')}`

/** Host route the Client row fetches (exact match, same origin). */
export const UPDATE_ROUTE_PATH = '/catppuccin/check-update'

/** Network budget for the Host's registry lookup. */
export const UPDATE_FETCH_TIMEOUT_MS = 8000

/** Release channels the check knows about. */
export type UpdateChannel = 'latest' | 'beta'

/** The `dist-tags` object of an npm packument. */
export interface DistTags {
  latest?: string
  beta?: string
}

/** The newest release a given install should chase, and on which channel. */
export interface NewestRelease {
  version: string
  channel: UpdateChannel
}

/**
 * The copyable CLI upgrade command for one channel (`dsh plugin` is a thin
 * pnpm forwarder). The profile name comes from the Host's runtime probe
 * (`src/profile-detect.ts`), never hard-coded, so the command works on any
 * deployment out of the box.
 * @param channel - the dist-tag to chase.
 * @param profile - the DSH profile name to target.
 */
export function updateCommandFor(channel: UpdateChannel, profile: string): string {
  return `dsh plugin --profile ${profile} add ${PACKAGE_NAME}@${channel}`
}

/**
 * Pick the newest release worth reporting for the given install:
 * - a stable install only chases the `latest` tag (never downgrades onto a
 *   beta), so a stable user on the last stable sees "up to date";
 * - a prerelease install (e.g. a `beta`-tagged version) also chases `beta`,
 *   so beta users see newer betas — and a stable release that outranks their
 *   prerelease promotes them via `@latest`.
 * @param current - the installed version.
 * @param tags - the registry's dist-tags.
 * @returns the newest candidate and its channel, or null when nothing applies.
 */
export function selectNewest(current: string, tags: DistTags): NewestRelease | null {
  const candidates: NewestRelease[] = []
  if (tags.latest !== undefined) candidates.push({ version: tags.latest, channel: 'latest' })
  const parsed = parseVersion(current)
  if (tags.beta !== undefined && parsed !== null && parsed.prerelease.length > 0) {
    candidates.push({ version: tags.beta, channel: 'beta' })
  }
  if (candidates.length === 0) return null
  let best = candidates[0]
  for (const candidate of candidates.slice(1)) {
    if (compareVersions(best.version, candidate.version) < 0) best = candidate
  }
  return best
}

/** Stable machine-readable outcome code (borrowed from the plugin-update
 *  error-code discipline of dsh-vision-toolkit): the Client maps it to copy
 *  instead of sniffing human text. */
export type UpdateErrorCode =
  | 'ok'
  | 'network'           // the same-origin fetch itself failed (client side)
  | 'registry-unreachable' // npm registry could not be reached or timed out
  | 'registry-http'     // registry answered with a non-2xx status
  | 'no-dist-tags'      // registry returned no usable dist-tags
  | 'invalid-response'  // registry response could not be parsed

/** How this package is installed inside the probed DSH profile. */
export type InstallSource = 'registry' | 'link' | 'file' | 'git' | 'unknown'

/**
 * JSON payload of the update check. `ok: false` carries a human-readable
 * `error` plus a stable `code`; `ok: true` carries the comparison result.
 * The Host owns the semver comparison, the channel selection, and the
 * profile probe (single source of truth), so the Client never parses
 * versions or guesses the profile name itself.
 */
export interface UpdateCheckPayload {
  /** Whether the registry lookup succeeded. */
  ok: boolean
  /** Installed version (from this package's own manifest). */
  current?: string
  /** Newest release worth chasing (`latest`, plus `beta` for prerelease installs). */
  latest?: string
  /** `latest` is strictly newer than `current`. */
  outdated?: boolean
  /** The dist-tag the newest release came from. */
  channel?: UpdateChannel
  /** Copyable CLI upgrade command (present when outdated). */
  updateCommand?: string
  /** DSH profile name the upgrade command targets (probed, not guessed). */
  profile?: string
  /** Whether the profile probe actually found the install (false = fallback). */
  profileDetected?: boolean
  /** How the package is installed in that profile (drives copy). */
  installSource?: InstallSource
  /** ISO timestamp of the check (registry lookup moment). */
  checkedAt?: string
  /** Stable outcome code (see {@link UpdateErrorCode}). */
  code?: UpdateErrorCode
  /** Failure detail (only when `ok` is false). */
  error?: string
}
