// @vitest-environment node
/**
 * Profile-probe spec — the argv hint parser, the registry-spec classifier,
 * and the DSH-home scan that decide which profile name the upgrade command
 * targets and whether an npm upgrade command even applies. The IO probe
 * (detectProfile) is exercised against a throwaway DSH-home fixture on disk.
 */
import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FALLBACK_PROFILE,
  detectProfile,
  installSourceOf,
  isRegistrySpec,
  profileHint,
} from '../src/profile-detect.ts'
import { PACKAGE_NAME } from '../src/update-check.ts'

describe('profileHint', () => {
  it('accepts a leading bare profile name', () => {
    expect(profileHint(['web'])).toBe('web')
    expect(profileHint(['headless', '--port', '3080'])).toBeUndefined()
  })

  it('accepts --profile as a separate argument or =value', () => {
    expect(profileHint(['--profile', 'web'])).toBe('web')
    expect(profileHint(['--profile=headless'])).toBe('headless')
    expect(profileHint(['serve', '--profile', 'web', '--port', '3080'])).toBe('web')
  })

  it('returns undefined when no profile is given', () => {
    expect(profileHint([])).toBeUndefined()
    expect(profileHint(['--port', '3080'])).toBeUndefined()
  })
})

describe('isRegistrySpec', () => {
  it('accepts plain semver ranges', () => {
    expect(isRegistrySpec('^0.2.5')).toBe(true)
    expect(isRegistrySpec('~1.2.3')).toBe(true)
    expect(isRegistrySpec('0.2.5')).toBe(true)
    expect(isRegistrySpec('*')).toBe(true)
  })

  it('rejects link:, file:, workspace: and git/URL specs', () => {
    expect(isRegistrySpec('link:D:\\Vibe-Coding\\dsh-catppuccin')).toBe(false)
    expect(isRegistrySpec('file:../dsh-catppuccin')).toBe(false)
    expect(isRegistrySpec('workspace:*')).toBe(false)
    expect(isRegistrySpec('git+https://github.com/NoNameLeGo/dsh-catppuccin-theme.git')).toBe(false)
    expect(isRegistrySpec('https://registry.npmjs.org/@nonamelego/dsh-catppuccin')).toBe(false)
    expect(isRegistrySpec('github:NoNameLeGo/dsh-catppuccin-theme')).toBe(false)
  })

  it('rejects bare paths and empty specs', () => {
    expect(isRegistrySpec('C:\\code\\dsh-catppuccin')).toBe(false)
    expect(isRegistrySpec('./dsh-catppuccin')).toBe(false)
    expect(isRegistrySpec('')).toBe(false)
  })
})

describe('installSourceOf', () => {
  it('classifies non-registry specs into link/file/git', () => {
    expect(installSourceOf('link:../dsh-catppuccin')).toBe('link')
    expect(installSourceOf('workspace:*')).toBe('link')
    expect(installSourceOf('file:../dsh-catppuccin')).toBe('file')
    expect(installSourceOf('git+https://github.com/NoNameLeGo/dsh-catppuccin-theme.git')).toBe('git')
    expect(installSourceOf('github:NoNameLeGo/dsh-catppuccin-theme')).toBe('git')
  })
})

describe('detectProfile', () => {
  async function fixtureDshHome(deps: Record<string, string>): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), 'dsh-catppuccin-probe-'))
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
    await mkdir(join(home, 'profiles', 'headless'), { recursive: true })
    await writeFile(join(home, 'profiles', 'web', 'package.json'), JSON.stringify({
      dependencies: { ...deps, 'some-other-pkg': '^1.0.0' },
    }))
    await writeFile(join(home, 'profiles', 'headless', 'package.json'), JSON.stringify({
      dependencies: { 'unrelated': '^1.0.0' },
    }))
    return home
  }

  it('honors an explicit --profile hint that carries the package', async () => {
    const home = await fixtureDshHome({ [PACKAGE_NAME]: '^0.2.5' })
    const probe = await detectProfile({ dshHome: home, argv: ['--profile', 'web'] })
    expect(probe).toEqual({ name: 'web', detected: true, installSource: 'registry' })
  })

  it('scans all profiles and finds the one listing the package', async () => {
    const home = await fixtureDshHome({ [PACKAGE_NAME]: 'link:../dsh-catppuccin' })
    const probe = await detectProfile({ dshHome: home, argv: [] })
    expect(probe).toEqual({ name: 'web', detected: true, installSource: 'link' })
  })

  it('falls back with detected=false when no profile lists the package', async () => {
    const home = await fixtureDshHome({ 'other': '^1.0.0' })
    const probe = await detectProfile({ dshHome: home, argv: [] })
    expect(probe).toEqual({ name: FALLBACK_PROFILE, detected: false, installSource: 'unknown' })
  })

  it('keeps an unmatched hint name in the fallback', async () => {
    const home = await fixtureDshHome({ 'other': '^1.0.0' })
    const probe = await detectProfile({ dshHome: home, argv: ['--profile', 'custom'] })
    expect(probe).toEqual({ name: 'custom', detected: false, installSource: 'unknown' })
  })

  it('lets the Desktop profile win over every probe and classify from its own dir', async () => {
    const home = await fixtureDshHome({ [PACKAGE_NAME]: '^0.2.5' })
    const custom = await mkdtemp(join(tmpdir(), 'dsh-catppuccin-desktop-'))
    await writeFile(join(custom, 'package.json'), JSON.stringify({
      dependencies: { [PACKAGE_NAME]: 'link:../dsh-catppuccin' },
    }))
    // argv says web, the home scan would find web — but Desktop is authoritative.
    const probe = await detectProfile({
      dshHome: home,
      argv: ['--profile', 'web'],
      desktopProfile: { name: 'desktop', dir: custom },
    })
    expect(probe).toEqual({ name: 'desktop', detected: true, installSource: 'link' })
  })

  it('honors the Desktop profile name even when its manifest is unreadable', async () => {
    const home = await fixtureDshHome({ [PACKAGE_NAME]: '^0.2.5' })
    const probe = await detectProfile({
      dshHome: home,
      argv: ['--profile', 'web'],
      desktopProfile: { name: 'desktop' },
    })
    // No dir given → falls back to home/profiles/desktop, which does not exist.
    expect(probe).toEqual({ name: 'desktop', detected: true, installSource: 'unknown' })
  })

  it('returns a valid fallback when the DSH home does not exist', async () => {
    const probe = await detectProfile({ dshHome: join(tmpdir(), 'does-not-exist-dsh-home'), argv: [] })
    expect(probe).toEqual({ name: FALLBACK_PROFILE, detected: false, installSource: 'unknown' })
  })
})