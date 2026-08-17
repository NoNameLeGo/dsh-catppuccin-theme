/**
 * Minimal semver comparison for update detection — dependency-free, so the
 * Host half and the unit tests share one implementation. Follows the semver
 * 2.0.0 precedence rules for `major.minor.patch[-prerelease][+build]`:
 * build metadata is ignored, prerelease identifiers compare numerically when
 * both are numeric and ASCII-wise otherwise, and a prerelease of the same
 * core sorts before its stable release.
 */

/** A parsed semver triple plus its prerelease identifiers. */
export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  /** Prerelease identifiers: numeric parts become numbers, the rest strings. */
  prerelease: readonly (string | number)[]
}

/** Parse a semver string, or null when it is not `v?x.y.z[-pre][+build]`. */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(raw.trim())
  if (match === null) return null
  const prerelease = (match[4] ?? '').split('.').filter((part) => part !== '').map((part) =>
    /^\d+$/.test(part) ? Number(part) : part,
  )
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  }
}

/**
 * Order two version strings per semver precedence.
 * @returns -1 when `a` < `b`, 0 when equal, 1 when `a` > `b`.
 *          Unparseable inputs sort after every parseable version (equal to
 *          each other), so a garbage `current` never reports an update.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (pa === null && pb === null) return 0
  if (pa === null) return 1
  if (pb === null) return -1
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0
  if (pa.prerelease.length === 0) return 1
  if (pb.prerelease.length === 0) return -1
  const shared = Math.min(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < shared; i += 1) {
    const x = pa.prerelease[i]
    const y = pb.prerelease[i]
    if (x === y) continue
    // Numeric identifiers sort before alphanumeric ones; two numerics compare
    // numerically, two strings ASCII-wise.
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  if (pa.prerelease.length !== pb.prerelease.length) {
    return pa.prerelease.length < pb.prerelease.length ? -1 : 1
  }
  return 0
}

/**
 * Whether `latest` is a strictly newer release than `current` — i.e. whether
 * an update is available. A newer installed prerelease (e.g. a git install
 * ahead of npm) correctly reports no update.
 */
export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0
}
