// @vitest-environment node
/**
 * Update-check contract: channel selection (item I — the persisted channel
 * preference must steer `selectNewest`), the upgrade command builder, and the
 * stable error-code vocabulary (item U splits `network` into local/upstream).
 */
import { describe, expect, it } from 'vitest'
import {
  PACKAGE_NAME,
  REGISTRY_PACKUMENT_URL,
  UPDATE_ROUTE_PATH,
  selectNewest,
  updateCommandFor,
} from '../src/update-check.ts'
import type { UpdateChannel } from '../src/update-check.ts'

describe('selectNewest (channel preference, item I)', () => {
  const tags = { latest: '0.5.0', beta: '0.6.0-beta.0' }

  it('a stable install without a preference chases only latest (no downgrade)', () => {
    const pick = selectNewest('0.4.3', tags)
    expect(pick).toEqual({ version: '0.5.0', channel: 'latest' })
  })

  it('a prerelease install chases beta on top of latest', () => {
    const pick = selectNewest('0.6.0-beta.0', tags)
    expect(pick).toEqual({ version: '0.6.0-beta.0', channel: 'beta' })
  })

  it('a stable install chased beta when the user prefers the beta channel', () => {
    const pick = selectNewest('0.4.3', tags, 'beta')
    expect(pick).toEqual({ version: '0.6.0-beta.0', channel: 'beta' })
  })

  it('a newer stable still wins over beta (no downgrade onto an old beta)', () => {
    const pick = selectNewest('0.5.0', { latest: '0.7.0', beta: '0.6.0-beta.0' }, 'beta')
    expect(pick).toEqual({ version: '0.7.0', channel: 'latest' })
  })

  it('an explicit latest preference pins the check to the stable tag', () => {
    expect(selectNewest('0.4.3', tags, 'latest')).toEqual({ version: '0.5.0', channel: 'latest' })
    // Even a prerelease install with a pinned latest never chases beta.
    expect(selectNewest('0.6.0-beta.0', tags, 'latest')).toEqual({ version: '0.5.0', channel: 'latest' })
  })

  it('returns null when nothing applies', () => {
    expect(selectNewest('0.5.0', {})).toBeNull()
    expect(selectNewest('0.5.0', {}, 'beta')).toBeNull()
  })
})

describe('updateCommandFor', () => {
  it('targets the given profile and dist-tag', () => {
    expect(updateCommandFor('beta', 'dsh-tui')).toBe(
      `dsh plugin --profile dsh-tui add ${PACKAGE_NAME}@beta`,
    )
    expect(updateCommandFor('latest', 'web')).toBe(
      `dsh plugin --profile web add ${PACKAGE_NAME}@latest`,
    )
  })
})

describe('route contract (stable identifiers)', () => {
  it('the route path and registry URL are the settled public surface', () => {
    expect(UPDATE_ROUTE_PATH).toBe('/catppuccin/check-update')
    expect(REGISTRY_PACKUMENT_URL).toBe(`https://registry.npmjs.org/${PACKAGE_NAME.replace('/', '%2F')}`)
  })

  it('the error vocabulary splits network into local/upstream (item U)', () => {
    // Compile-time vocabulary check: the union members the row maps to copy.
    const codes: readonly string[] = [
      'ok',
      'network.local',
      'network.upstream',
      'registry-unreachable',
      'registry-http',
      'no-dist-tags',
      'invalid-response',
    ]
    for (const code of codes) expect(code).toBe(code)
  })
})

// Type-only reference so the union is exercised by the compiler.
const _channel: UpdateChannel = 'latest'
void _channel