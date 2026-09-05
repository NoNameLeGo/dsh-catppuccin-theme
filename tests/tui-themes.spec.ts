import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { syncTuiThemes } from '../src/tui-themes.ts'

/** The repo's shipped theme directory (src/.. /themes). */
const BUNDLED = fileURLToPath(new URL('../themes', import.meta.url))

const scratch = mkdtempSync(join(tmpdir(), 'catppuccin-tui-themes-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('syncTuiThemes', () => {
  it('no-ops when the TUI data dir does not exist (web-only user)', () => {
    const home = join(scratch, 'missing-home')
    expect(syncTuiThemes(BUNDLED, home)).toEqual([])
    expect(() => readFileSync(join(home, 'themes', 'catppuccin-mocha.json'))).toThrow()
  })

  it('copies all four themes into a fresh TUI home', () => {
    const home = join(scratch, 'fresh-home')
    mkdirSync(home)
    const written = syncTuiThemes(BUNDLED, home)
    expect(written.sort()).toEqual([
      'catppuccin-frappe.json',
      'catppuccin-latte.json',
      'catppuccin-macchiato.json',
      'catppuccin-mocha.json',
    ])
    const dest = readFileSync(join(home, 'themes', 'catppuccin-mocha.json'), 'utf8')
    expect(dest).toBe(readFileSync(join(BUNDLED, 'catppuccin-mocha.json'), 'utf8'))
  })

  it('is idempotent: an in-sync home yields no writes', () => {
    const home = join(scratch, 'fresh-home') // populated by the previous test
    expect(syncTuiThemes(BUNDLED, home)).toEqual([])
  })

  it('backs up a drifted owned file and writes the shipped copy (default conflict = backup)', () => {
    const home = join(scratch, 'fresh-home')
    const dest = join(home, 'themes', 'catppuccin-mocha.json')
    writeFileSync(dest, '{ "hijacked": true }')
    expect(syncTuiThemes(BUNDLED, home)).toEqual(['catppuccin-mocha.json'])
    expect(readFileSync(dest, 'utf8')).toBe(
      readFileSync(join(BUNDLED, 'catppuccin-mocha.json'), 'utf8'),
    )
    // The user's customization survives next to it (item R).
    expect(readFileSync(`${dest}.bak`, 'utf8')).toBe('{ "hijacked": true }')
  })

  it('preserve leaves a drifted owned file alone', () => {
    const home = join(scratch, 'preserve-home')
    mkdirSync(home)
    syncTuiThemes(BUNDLED, home) // fresh home: everything in sync afterwards
    const dest = join(home, 'themes', 'catppuccin-mocha.json')
    writeFileSync(dest, '{ "mine": true }')
    expect(syncTuiThemes(BUNDLED, home, { onConflict: 'preserve' })).toEqual([])
    expect(readFileSync(dest, 'utf8')).toBe('{ "mine": true }')
  })

  it('overwrite restores the historical force-sync behavior', () => {
    const home = join(scratch, 'overwrite-home')
    mkdirSync(home)
    syncTuiThemes(BUNDLED, home) // fresh home: everything in sync afterwards
    const dest = join(home, 'themes', 'catppuccin-mocha.json')
    writeFileSync(dest, '{ "nope": true }')
    expect(syncTuiThemes(BUNDLED, home, { onConflict: 'overwrite' })).toEqual(['catppuccin-mocha.json'])
    expect(readFileSync(dest, 'utf8')).toBe(readFileSync(join(BUNDLED, 'catppuccin-mocha.json'), 'utf8'))
    expect(() => readFileSync(`${dest}.bak`)).toThrow() // no backup under overwrite
  })

  it('dry-run reports the planned writes without touching the disk (item S)', () => {
    const home = join(scratch, 'dryrun-home')
    mkdirSync(home)
    syncTuiThemes(BUNDLED, home) // fresh home: everything in sync afterwards
    const dest = join(home, 'themes', 'catppuccin-mocha.json')
    writeFileSync(dest, '{ "custom": true }')
    const planned = syncTuiThemes(BUNDLED, home, { dryRun: true })
    expect(planned).toEqual(['catppuccin-mocha.json'])
    expect(readFileSync(dest, 'utf8')).toBe('{ "custom": true }') // untouched
    expect(() => readFileSync(`${dest}.bak`)).toThrow() // no backup taken
  })

  it('never touches files outside the catppuccin-*.json namespace', () => {
    const home = join(scratch, 'user-themes')
    mkdirSync(join(home, 'themes'), { recursive: true })
    const userTheme = join(home, 'themes', 'my-custom.json')
    writeFileSync(userTheme, '{ "name": "my-custom" }')
    syncTuiThemes(BUNDLED, home)
    expect(readFileSync(userTheme, 'utf8')).toBe('{ "name": "my-custom" }')
  })

  it('synces community themes write-if-missing and never overwrites (item T)', () => {
    const home = join(scratch, 'community-home')
    const communityDir = join(home, 'themes', 'catppuccin-community')
    mkdirSync(communityDir, { recursive: true })
    writeFileSync(join(communityDir, 'comrade.json'), '{ "name": "comrade" }')
    writeFileSync(join(communityDir, 'occupied.json'), '{ "name": "community-copy" }')
    // An existing theme with the same name must win over the community copy.
    writeFileSync(join(home, 'themes', 'occupied.json'), '{ "name": "user-copy" }')
    expect(syncTuiThemes(BUNDLED, home, { communityDir }).sort()).toEqual([
      'catppuccin-frappe.json',
      'catppuccin-latte.json',
      'catppuccin-macchiato.json',
      'catppuccin-mocha.json',
      'comrade.json',
    ])
    expect(readFileSync(join(home, 'themes', 'occupied.json'), 'utf8')).toBe('{ "name": "user-copy" }')
    // Second run: everything is in sync, community included.
    expect(syncTuiThemes(BUNDLED, home, { communityDir })).toEqual([])
  })

  it('no-ops when the community dir is absent', () => {
    const home = join(scratch, 'no-community-home')
    mkdirSync(home)
    expect(syncTuiThemes(BUNDLED, home, { communityDir: join(home, 'themes', 'catppuccin-community') })).toEqual([
      'catppuccin-frappe.json',
      'catppuccin-latte.json',
      'catppuccin-macchiato.json',
      'catppuccin-mocha.json',
    ])
  })
})