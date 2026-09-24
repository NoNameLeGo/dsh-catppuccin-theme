// @vitest-environment node
/**
 * The one-shot legacy migration, including the race the real machine found.
 *
 * On a real DSH 0.1.7-rc.1 host (2026-09-24) the deferred timer and the entry's
 * own `settings/document-updated` fired close enough that two
 * `describe` → `update` pairs ran concurrently: the first write bumped the
 * namespace revision, the second was refused, and the failure was logged as
 * `legacy state migration failed: SettingsConflictError …` even though the
 * migration had SUCCEEDED. Two attempts must never be in flight at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { migrateLegacyStateOnce, scheduleLegacyMigration, type SettingsLike } from '../src/migrate-legacy.ts'
import { CATPPUCCIN_ENTRY_ID, defaultState, hasUserLayerSection, settingsSectionFromState } from '../src/state.ts'

const ENTRY = CATPPUCCIN_ENTRY_ID
/** The event brands its namespace argument; our constant is the same string. */
const ENTRY_NS = CATPPUCCIN_ENTRY_ID as unknown as SettingsNamespace
const nonDefault = { ...defaultState(), flavor: 'catppuccin-mocha' as const }

/** Point `readLegacyState()` at a temp DSH home holding the legacy file. */
function withLegacyHome(): { home: string; dispose: () => void } {
  const home = mkdtempSync(join(tmpdir(), 'dsh-catppuccin-migrate-'))
  writeFileSync(join(home, 'catppuccin-state.json'), JSON.stringify(nonDefault))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  return {
    home,
    dispose: () => {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      rmSync(home, { recursive: true, force: true })
    },
  }
}

/** A settings double that tracks a revision like the real service does. */
function settingsDouble(options: { descriptors?: boolean, initialUser?: unknown, latencyMs?: number } = {}) {
  const updates: Array<{ ns: string; patch: object; revision: number | undefined }> = []
  const latency = options.latencyMs ?? 0
  let describes = 0
  let attempts = 0
  let revision = 0
  let user: unknown = options.initialUser
  const settings: SettingsLike = {
    describe: () => {
      describes += 1
      return options.descriptors === false ? [] : [{ ns: ENTRY, revision, user }]
    },
    update: async (ns, patch, expectedRevision) => {
      attempts += 1
      // The real write crosses the wire (configEditor.edit → file write), which
      // is what let a second attempt read a pre-write revision in the field.
      if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency))
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        throw new Error(`settings namespace "dsh-catppuccin" changed since it was read (expected revision ${expectedRevision}, now ${revision})`)
      }
      updates.push({ ns, patch, revision: expectedRevision })
      revision += 1
      user = patch
    },
  }
  return { settings, updates, revisionOf: () => revision, describes: () => describes, attempts: () => attempts }
}

describe('migrateLegacyStateOnce', () => {
  let legacy: ReturnType<typeof withLegacyHome>
  beforeEach(() => { legacy = withLegacyHome() })
  afterEach(() => legacy.dispose())

  it('writes the legacy file into the addressed namespace, once', async () => {
    const { settings, updates } = settingsDouble()
    expect(await migrateLegacyStateOnce(settings, ENTRY, hasUserLayerSection, { fence: true })).toBe('migrated')
    expect(updates).toHaveLength(1)
    expect(updates[0]?.ns).toBe(ENTRY)
    expect(updates[0]?.patch).toEqual(settingsSectionFromState(nonDefault))
    // Second run: the double now reports a user layer, so nothing overwrites it.
    expect(await migrateLegacyStateOnce(settings, ENTRY, hasUserLayerSection, { fence: true })).toBe('skipped')
    expect(updates).toHaveLength(1)
  })

  it('reports pending while the entry is not addressable, and absent with no file', async () => {
    const { settings } = settingsDouble({ descriptors: false })
    expect(await migrateLegacyStateOnce(settings, ENTRY, hasUserLayerSection, { fence: true })).toBe('pending')
    rmSync(join(legacy.home, 'catppuccin-state.json'))
    const live = settingsDouble()
    expect(await migrateLegacyStateOnce(live.settings, ENTRY, hasUserLayerSection, { fence: true })).toBe('absent')
  })

  it('honours the channel predicate: an empty object is a layer only on the legacy seam', async () => {
    // The profile patch's `override` defaults to `{}` (the new seam), while the
    // legacy document omits the field entirely when it has no such section.
    const emptyLayer = { initialUser: {} }
    const modern = settingsDouble(emptyLayer)
    expect(await migrateLegacyStateOnce(modern.settings, ENTRY, hasUserLayerSection, { fence: true })).toBe('migrated')
    const legacy = settingsDouble(emptyLayer)
    expect(await migrateLegacyStateOnce(legacy.settings, ENTRY, (user) => user !== undefined, { fence: true })).toBe('skipped')
  })
})

describe('scheduleLegacyMigration', () => {
  let legacy: ReturnType<typeof withLegacyHome>
  beforeEach(() => { legacy = withLegacyHome() })
  afterEach(() => { legacy.dispose(); vi.useRealTimers() })

  it('never runs two attempts concurrently (the real-host SettingsConflictError)', async () => {
    // Reproduces the field sequence: attempt A reads revision 0 and starts a
    // slow write; the deferred timer fires BEFORE that write commits, reads
    // revision 0 again, and its write is then refused — logged as a failure
    // even though the migration succeeded.
    const { settings, updates, describes, attempts } = settingsDouble({ latencyMs: 25 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = new Context()
    scheduleLegacyMigration(ctx, settings, ENTRY, hasUserLayerSection)
    // Fire the notification the scheduler also listens to, in the same tick the
    // deferred (0 ms) timer is pending.
    ctx.emit('settings/document-updated', ENTRY_NS, 0)
    await vi.waitFor(() => expect(updates).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 120))
    ctx.emit('settings/document-updated', ENTRY_NS, 1)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(updates).toHaveLength(1)
    // The bug showed up as a SECOND read/write pair racing the first.
    expect(describes()).toBe(1)
    expect(attempts()).toBe(1)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    await ctx.fiber.dispose()
  })

  it('retries after a pending outcome, and stops after one success', async () => {
    let addressable = false
    const updates: string[] = []
    let revision = 0
    const settings: SettingsLike = {
      describe: () => addressable ? [{ ns: ENTRY, revision, user: undefined }] : [],
      update: async (ns, _patch, expectedRevision) => {
        if (expectedRevision !== undefined && expectedRevision !== revision) throw new Error('conflict')
        updates.push(ns)
        revision += 1
      },
    }
    const ctx = new Context()
    scheduleLegacyMigration(ctx, settings, ENTRY, hasUserLayerSection)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(updates).toHaveLength(0) // nothing addressable yet — no bogus write
    addressable = true
    ctx.emit('settings/document-updated', ENTRY_NS, 0)
    await vi.waitFor(() => expect(updates).toHaveLength(1))
    ctx.emit('settings/document-updated', ENTRY_NS, 1)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(updates).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('cancels its timers with the fiber', async () => {
    const { settings, updates } = settingsDouble({ descriptors: false })
    const ctx = new Context()
    scheduleLegacyMigration(ctx, settings, ENTRY, hasUserLayerSection)
    await ctx.fiber.dispose()
    await new Promise((resolve) => setTimeout(resolve, 3200))
    expect(updates).toHaveLength(0)
  })
})
