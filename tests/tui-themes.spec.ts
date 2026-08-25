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

  it('overwrites a drifted owned file back to the shipped copy', () => {
    const home = join(scratch, 'fresh-home')
    const dest = join(home, 'themes', 'catppuccin-mocha.json')
    writeFileSync(dest, '{ "hijacked": true }')
    expect(syncTuiThemes(BUNDLED, home)).toEqual(['catppuccin-mocha.json'])
    expect(readFileSync(dest, 'utf8')).toBe(
      readFileSync(join(BUNDLED, 'catppuccin-mocha.json'), 'utf8'),
    )
  })

  it('never touches files outside the catppuccin-*.json namespace', () => {
    const home = join(scratch, 'user-themes')
    mkdirSync(join(home, 'themes'), { recursive: true })
    const userTheme = join(home, 'themes', 'my-custom.json')
    writeFileSync(userTheme, '{ "name": "my-custom" }')
    syncTuiThemes(BUNDLED, home)
    expect(readFileSync(userTheme, 'utf8')).toBe('{ "name": "my-custom" }')
  })
})
