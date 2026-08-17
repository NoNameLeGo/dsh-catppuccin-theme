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
 * pnpm forwarder; the profile name varies per deployment).
 */
export function updateCommandFor(channel: UpdateChannel): string {
  return `dsh plugin --profile web add ${PACKAGE_NAME}@${channel}`
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

/**
 * JSON payload of the update check. `ok: false` carries a human-readable
 * `error`; `ok: true` carries the comparison result. The Host owns the
 * semver comparison and the channel selection (single source of truth), so
 * the Client never parses versions itself.
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
  /** Failure detail (only when `ok` is false). */
  error?: string
}
