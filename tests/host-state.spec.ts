/**
 * Host durable-state store — file path, read/write round-trip, corruption and
 * atomicity. This is the store that survives DSH Desktop's per-launch random
 * loopback port (the thing browser localStorage cannot do).
 */
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDurableState, stateFilePath, writeDurableState } from '../src/host-state.ts'
import { STATE_FILENAME, sanitizeState } from '../src/state.ts'

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'catppuccin-state-'))
}

describe('host durable store', () => {
  it('resolves the state file under the DSH home', () => {
    const home = tempHome()
    expect(stateFilePath(home)).toBe(join(home, STATE_FILENAME))
    expect(join(home, STATE_FILENAME)).toBe(join(home, 'catppuccin-state.json'))
  })

  it('reads null when the file does not exist yet', () => {
    const home = tempHome()
    expect(readDurableState(home)).toBeNull()
  })

  it('round-trips a written state (and sanitizes on the way)', () => {
    const home = tempHome()
    const state = sanitizeState({ flavor: 'catppuccin-mocha', glass: { enabled: true, mode: 'compat', blur: 9, frost: 33, brightness: 40 } })
    writeDurableState(state, home)
    expect(readDurableState(home)).toEqual(state)
  })

  it('clamps hostile input before writing it (never stores garbage)', () => {
    const home = tempHome()
    const hostile = { flavor: 'garbage', glass: { enabled: 'yes', blur: 9999 } }
    writeDurableState(hostile as never, home)
    // The on-disk state is the sanitized/clamped shape, not the raw input:
    // unknown flavour → off, non-boolean flag → off, huge blur → 40.
    expect(readDurableState(home)).toEqual(sanitizeState(hostile))
  })

  it('overwrites the previous state atomically', () => {
    const home = tempHome()
    writeDurableState(sanitizeState({ flavor: 'catppuccin-latte' }), home)
    writeDurableState(sanitizeState({ flavor: 'catppuccin-mocha' }), home)
    expect(readDurableState(home)?.flavor).toBe('catppuccin-mocha')
    // The on-disk document is valid JSON with the exact final content.
    expect(JSON.parse(readFileSync(stateFilePath(home), 'utf8')).flavor).toBe('catppuccin-mocha')
  })

  it('reads null for a corrupt file instead of throwing', () => {
    const home = tempHome()
    writeDurableState(sanitizeState({ flavor: 'catppuccin-mocha' }), home)
    // Truncate/corrupt the on-disk document.
    writeFileRaw(stateFilePath(home), '{ not json !!')
    expect(readDurableState(home)).toBeNull()
  })

  it('keeps no temp litter after a write', () => {
    const home = tempHome()
    writeDurableState(sanitizeState({ flavor: 'catppuccin-frappe' }), home)
    const litter = [stateFilePath(home), ...listTempSiblings(home)].some((p) => existsSync(p))
    expect(litter).toBe(true) // the final file exists…
    // …and no .tmp-* sibling temp dirs remain.
    expect(listTempSiblings(home).length).toBe(0)
  })
})

function writeFileRaw(path: string, content: string): void {
  writeFileSync(path, content, 'utf8')
}

function listTempSiblings(home: string): string[] {
  try {
    return readdirSync(home).filter((name) => name.includes(`${STATE_FILENAME}.tmp-`))
  } catch {
    return []
  }
}
