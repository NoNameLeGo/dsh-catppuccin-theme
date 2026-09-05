/**
 * Legacy durable-state read — the 0.5.0 one-shot migration source. Verifies
 * the file path resolution and the read contract (absent/corrupt → null,
 * round-trip sanitization), i.e. the read half of the old host store: the
 * write half is gone with the `/catppuccin/state` route, superseded by the
 * official settings document.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { legacyStateFilePath, readLegacyState } from '../src/legacy-state.ts'
import { STATE_FILENAME, sanitizeState } from '../src/state.ts'

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'catppuccin-legacy-'))
}

describe('legacy state read (migration source)', () => {
  it('resolves the legacy file under the DSH home', () => {
    const home = tempHome()
    expect(legacyStateFilePath(home)).toBe(join(home, STATE_FILENAME))
    expect(join(home, STATE_FILENAME)).toBe(join(home, 'catppuccin-state.json'))
  })

  it('returns null when the file does not exist yet', () => {
    expect(readLegacyState(tempHome())).toBeNull()
  })

  it('round-trips a stored state (sanitizing on the way)', () => {
    const home = tempHome()
    const state = sanitizeState({ flavor: 'catppuccin-mocha', glass: { enabled: true, mode: 'compat', blur: 9, frost: 33, brightness: 40 } })
    writeFileSync(join(home, STATE_FILENAME), JSON.stringify(state), 'utf8')
    expect(readLegacyState(home)).toEqual(state)
  })

  it('clamps hostile file content instead of throwing', () => {
    const home = tempHome()
    writeFileSync(join(home, STATE_FILENAME), JSON.stringify({ flavor: 'garbage', glass: { enabled: 'yes', blur: 9999 } }), 'utf8')
    expect(readLegacyState(home)).toEqual(sanitizeState({ flavor: 'garbage', glass: { enabled: 'yes', blur: 9999 } }))
  })

  it('returns null for a corrupt file instead of throwing', () => {
    const home = tempHome()
    writeFileSync(join(home, STATE_FILENAME), '{ not json !!', 'utf8')
    expect(readLegacyState(home)).toBeNull()
  })
})