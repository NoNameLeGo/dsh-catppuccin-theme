// @vitest-environment node
/**
 * Update-check spec — the dependency-free semver comparator and channel
 * selector that decide whether the npm registry holds a strictly newer
 * release than the installed manifest version. Covers stable ordering,
 * prerelease rules, build metadata, the garbage-input fallback (an
 * unparseable `current` must never report an update), and the
 * latest/beta dist-tag channel policy.
 */
import { describe, expect, it } from 'vitest'
import { compareVersions, isUpdateAvailable, parseVersion } from '../src/versions.ts'
import { selectNewest, updateCommandFor } from '../src/update-check.ts'

describe('parseVersion', () => {
  it('parses stable versions', () => {
    expect(parseVersion('0.2.5')).toEqual({ major: 0, minor: 2, patch: 5, prerelease: [] })
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
  })

  it('parses prerelease and build metadata', () => {
    expect(parseVersion('0.2.5-beta.0')).toEqual({ major: 0, minor: 2, patch: 5, prerelease: ['beta', 0] })
    expect(parseVersion('1.0.0-alpha.1+build.42').prerelease).toEqual(['alpha', 1])
  })

  it('rejects garbage', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('0.2')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders stable versions numerically', () => {
    expect(compareVersions('0.2.4', '0.2.5')).toBe(-1)
    expect(compareVersions('0.2.5', '0.2.5')).toBe(0)
    expect(compareVersions('0.3.0', '0.2.99')).toBe(1)
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1)
  })

  it('a stable release outranks its own prerelease', () => {
    expect(compareVersions('0.2.5-beta.0', '0.2.5')).toBe(-1)
    expect(compareVersions('0.2.5', '0.2.5-beta.0')).toBe(1)
  })

  it('orders prerelease identifiers semver-style', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.beta', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1)
    expect(compareVersions('1.0.0-beta', '1.0.0-rc.1')).toBe(-1)
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+build.1', '1.0.0+build.2')).toBe(0)
  })

  it('sorts unparseable inputs after every real version', () => {
    expect(compareVersions('0.2.5', 'not-a-version')).toBe(-1)
    expect(compareVersions('not-a-version', '0.2.5')).toBe(1)
    expect(compareVersions('nope', 'nope')).toBe(0)
  })
})

describe('isUpdateAvailable', () => {
  it('detects a newer release', () => {
    expect(isUpdateAvailable('0.2.5', '0.2.6')).toBe(true)
    expect(isUpdateAvailable('0.2.5-beta.0', '0.2.5-beta.1')).toBe(true)
  })

  it('reports no update when equal or newer', () => {
    expect(isUpdateAvailable('0.2.5', '0.2.5')).toBe(false)
    expect(isUpdateAvailable('0.2.6', '0.2.5')).toBe(false)
    // A git install ahead of npm (prerelease of a higher core) is not outdated.
    expect(isUpdateAvailable('0.2.6-beta.0', '0.2.5')).toBe(false)
  })

  it('a stable release supersedes the prerelease of the same core', () => {
    expect(isUpdateAvailable('0.2.5-beta.1', '0.2.5')).toBe(true)
  })

  it('never reports an update from garbage current', () => {
    expect(isUpdateAvailable('weird-local', '9.9.9')).toBe(false)
  })
})

describe('selectNewest', () => {
  const tags = { latest: '0.2.4', beta: '0.2.5-beta.1' }

  it('a stable install only chases the latest tag', () => {
    expect(selectNewest('0.2.4', tags)).toEqual({ version: '0.2.4', channel: 'latest' })
    // A stable user never chases the beta channel, even when beta outranks latest.
    expect(selectNewest('0.2.4', { latest: '0.2.4', beta: '0.3.0-beta.1' }))
      .toEqual({ version: '0.2.4', channel: 'latest' })
  })

  it('a prerelease install chases both channels and picks the newest', () => {
    expect(selectNewest('0.2.5-beta.1', tags)).toEqual({ version: '0.2.5-beta.1', channel: 'beta' })
    expect(selectNewest('0.2.5-beta.0', tags)).toEqual({ version: '0.2.5-beta.1', channel: 'beta' })
    // A stable release that outranks the prerelease promotes via latest.
    expect(selectNewest('0.2.5-beta.1', { latest: '0.2.5', beta: '0.2.5-beta.1' }))
      .toEqual({ version: '0.2.5', channel: 'latest' })
  })

  it('falls back to whichever tag exists', () => {
    expect(selectNewest('0.2.4', { latest: '0.2.4' })).toEqual({ version: '0.2.4', channel: 'latest' })
    expect(selectNewest('0.2.5-beta.1', { beta: '0.2.5-beta.2' }))
      .toEqual({ version: '0.2.5-beta.2', channel: 'beta' })
  })

  it('returns null when no tag applies', () => {
    expect(selectNewest('0.2.4', {})).toBeNull()
    // A stable install never chases a lone beta tag.
    expect(selectNewest('0.2.4', { beta: '0.2.5-beta.1' })).toBeNull()
    // An equal beta candidate still applies (the caller reports "up to date").
    expect(selectNewest('0.2.5-beta.1', { beta: '0.2.5-beta.1' }))
      .toEqual({ version: '0.2.5-beta.1', channel: 'beta' })
  })
})

describe('updateCommandFor', () => {
  it('names the dist-tag being chased and the target profile', () => {
    expect(updateCommandFor('latest', 'web')).toBe('dsh plugin --profile web add @nonamelego/dsh-catppuccin@latest')
    expect(updateCommandFor('beta', 'web')).toBe('dsh plugin --profile web add @nonamelego/dsh-catppuccin@beta')
    expect(updateCommandFor('latest', 'headless')).toBe('dsh plugin --profile headless add @nonamelego/dsh-catppuccin@latest')
  })
})
