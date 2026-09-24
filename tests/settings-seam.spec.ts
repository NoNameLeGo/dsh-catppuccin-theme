// @vitest-environment node
/**
 * Issue #15 seam tests — the two settings seams DSH serves, and the three
 * places their semantics differ.
 *
 * These lock the invariants the dual-channel design rests on:
 *  - the plugin never hard-depends on either seam's service name (the bug the
 *    issue reports: a hard `inject: ['settingsScope']` left the whole plugin
 *    pending on 0.1.7, which does not provide it);
 *  - `.volatile()` is feature-detected, because the OLD hosts load this module
 *    with schemastery 3.18.2, where the method does not exist at all;
 *  - the per-channel differences (user-layer predicate, write fence) live
 *    inside the adapter and are unreachable from its callers.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  CATPPUCCIN_SETTINGS_NS,
  CATPPUCCIN_ENTRY_ID,
  defaultSettingsSection,
  hasUserLayerSection,
} from '../src/state.ts'
import {
  CATPPUCCIN_SETTINGS_BASE,
  CatppuccinSettingsSchema,
  Config,
  maybeVolatile,
} from '../src/settings-catppuccin.ts'
import { createDurableScope, isScopeUsable } from '../src/client/state-sync.ts'

const repoFile = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

/* ------------------------------------------------------------------ *
 * The hard-dependency bug itself (issue #15)
 * ------------------------------------------------------------------ */

describe('client service dependencies', () => {
  const source = repoFile('src/client/index.ts')
  const declared = /export const inject = \[([^\]]*)\]/.exec(source)?.[1] ?? ''

  it('hard-depends on neither settings service', () => {
    // 0.1.7-alpha.1 dropped `settingsScope`; <= 0.1.6-alpha.2 never had
    // `configForms`. Listing either one here leaves the plugin pending forever
    // on the other half of the installed base.
    expect(declared).not.toContain('settingsScope')
    expect(declared).not.toContain('configForms')
    expect(declared).toContain('slots')
    expect(declared).toContain('locale')
    expect(declared).toContain('theme')
  })

  it('binds BOTH seams through optional injections', () => {
    const sync = repoFile('src/client/state-sync.ts')
    expect(sync).toContain("ctx.inject(['configForms']")
    expect(sync).toContain("ctx.inject(['settingsScope']")
  })
})

/* ------------------------------------------------------------------ *
 * Channel convergence: the caller must not see the differences
 * ------------------------------------------------------------------ */

describe('channel differences stay inside the adapter', () => {
  it('persistStateToScope drives the channel, never a raw seam', () => {
    const source = repoFile('src/client/state-sync.ts')
    const body = source.slice(
      source.indexOf('export async function persistStateToScope'),
      source.indexOf('\nlet pendingTimer'),
    )
    expect(body.length).toBeGreaterThan(0)
    // The fence decision and the user-layer predicate belong to the channel.
    expect(body).not.toContain('.mutate(')
    expect(body).not.toContain('snapshot.user')
    expect(body).toContain('scope.write(')
  })

  it('the plugin body never inspects the raw user layer', () => {
    const source = repoFile('src/client/index.ts')
    expect(source).not.toContain('snapshot.user')
    expect(source).toContain('scope.hasUserLayer(snapshot)')
  })
})

/* ------------------------------------------------------------------ *
 * Host schema: the volatile guard and the two forms
 * ------------------------------------------------------------------ */

interface SchemaJson {
  uid?: number | string
  refs?: Record<string, SchemaJson>
  dict?: Record<string, number | SchemaJson>
  meta?: Record<string, unknown>
  type?: string
}

/** Walk a serialized schemastery schema into leaf paths, resolved through the
 *  reference table the serializer emits. */
function leaves(json: SchemaJson): { volatile: string[]; plain: string[] } {
  const refs = json.refs ?? {}
  const resolve = (node: number | string | SchemaJson | undefined): SchemaJson | undefined =>
    typeof node === 'number' || typeof node === 'string' ? refs[String(node)] : node
  const volatilePaths: string[] = []
  const plainPaths: string[] = []
  const walk = (node: SchemaJson | undefined, path: string[], inherited: boolean): void => {
    if (node === undefined) return
    const isVolatile = inherited || node.meta?.volatile === true
    const dict = node.dict
    if (node.type === 'object' && dict !== undefined) {
      for (const [key, child] of Object.entries(dict)) walk(resolve(child), [...path, key], isVolatile)
      return
    }
    ;(isVolatile ? volatilePaths : plainPaths).push(path.join('.'))
  }
  walk(resolve(json.uid), [], false)
  return { volatile: volatilePaths, plain: plainPaths }
}

const CONFIG_FIELDS = ['flavor', 'autoCheck', 'updateChannel', 'overrides', 'shikiStyle']
const GLASS_FIELDS = ['enabled', 'mode', 'blur', 'frost', 'brightness']

describe('maybeVolatile feature detection', () => {
  it('marks the node when the capability exists', () => {
    const marked = { volatile: vi.fn(() => 'marked') }
    expect(maybeVolatile(marked)).toBe('marked')
    expect(marked.volatile).toHaveBeenCalledTimes(1)
  })

  it('is a no-op on a node without it (schemastery 3.18.2, the old hosts)', () => {
    // The plain object stands in for a 3.18.2 node: `.volatile` is absent, and
    // calling it unconditionally would throw at MODULE EVALUATION time —
    // turning "plugin pending" into "plugin failed to load".
    const legacy = { type: 'string' }
    expect(maybeVolatile(legacy)).toBe(legacy)
  })
})

describe('Config vs the legacy namespace schema', () => {
  it('the entry Config is fully volatile (that is what the form projects)', () => {
    const { volatile, plain } = leaves(Config.toJSON() as unknown as SchemaJson)
    expect(plain).toEqual([])
    expect(volatile.sort()).toEqual(
      [...CONFIG_FIELDS, ...GLASS_FIELDS.map((field) => `glass.${field}`)].sort(),
    )
  })

  it('the legacy namespace schema stays plain — no entry form appears there', () => {
    const { volatile } = leaves(CatppuccinSettingsSchema.toJSON() as unknown as SchemaJson)
    expect(volatile).toEqual([])
  })

  it('every default equals the shipped default (the client reads "defaults" as "no choice")', () => {
    // On a 0.1.7 host the Loader hands `apply` VOLATILE references, so the
    // resolved config arrives as `.get()` accessors — the form's `value` is
    // `plainConfig()`-unwrapped, which is why the two must agree field by
    // field: a mismatched default would make the client read "the document
    // already holds a choice" and write garbage on first boot.
    const resolved = Config({}) as Record<string, unknown>
    /** Unwrap `Volatile` refs the way the settings service's `plainConfig()`
     *  does before it serves a form value. */
    const plain = (value: unknown): unknown => {
      if (typeof value === 'object' && value !== null && 'get' in value && typeof (value as { get: unknown }).get === 'function') {
        return plain((value as { get(): unknown }).get())
      }
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plain(child)]))
      }
      return value
    }
    const expected = defaultSettingsSection()
    expect(plain(resolved)).toEqual(expected)
    expect(CATPPUCCIN_SETTINGS_BASE).toEqual(expected)
  })
})

/* ------------------------------------------------------------------ *
 * The id contract between the patch file and the new seam
 * ------------------------------------------------------------------ */

describe('profile entry id contract', () => {
  it('matches the insert row that carries the plugin', () => {
    const patch = repoFile('cordis.patch.yml')
    const row = /-\s+id:\s*(\S+)\s*\n\s+name:\s*'@nonamelego\/dsh-catppuccin'/.exec(patch)
    expect(row?.[1]).toBe(CATPPUCCIN_ENTRY_ID)
  })

  it('keeps the legacy namespace distinct from the entry id', () => {
    expect(CATPPUCCIN_SETTINGS_NS).not.toBe(CATPPUCCIN_ENTRY_ID)
  })
})

/* ------------------------------------------------------------------ *
 * Binding either seam, and binding neither
 * ------------------------------------------------------------------ */

function fakeSnapshot(user: unknown) {
  return {
    status: 'ready' as const,
    value: defaultSettingsSection(),
    base: defaultSettingsSection(),
    user,
    revision: 3,
    writable: true,
    mode: 'host' as const,
  }
}

/** A configForms double: the shape `ConfigForms.get()` returns. */
function fakeForm(accepted = true) {
  const mutate = vi.fn(async () => accepted)
  return {
    form: {
      getSnapshot: () => fakeSnapshot({}),
      subscribe: () => () => {},
      set: async () => accepted,
      unset: async () => accepted,
      mutate,
    },
    mutate,
  }
}

/** A legacy settingsScope double: the shape `.bind()` returns. */
function fakeLegacyScope() {
  const mutate = vi.fn(async () => {})
  return {
    binder: { bind: () => ({ getSnapshot: () => fakeSnapshot(undefined), subscribe: () => () => {}, mutate }) },
    mutate,
  }
}

describe('createDurableScope', () => {
  it('reports the unbound degradation before any service exists', async () => {
    const ctx = new Context()
    const scope = createDurableScope(ctx)
    expect(scope.kind).toBe('none')
    expect(isScopeUsable(scope.getSnapshot())).toBe(false)
    expect(await scope.write([], undefined)).toBe('failed')
    expect(scope.hasUserLayer(fakeSnapshot(undefined))).toBe(false)
    await ctx.fiber.dispose()
  })

  it('binds the 0.1.7+ form, fences its write and treats {} as "no user layer"', async () => {
    const ctx = new Context()
    const { form, mutate } = fakeForm()
    const scope = createDurableScope(ctx)
    ctx.provide('configForms', { get: () => form } as never)
    await vi.waitFor(() => expect(scope.kind).toBe('configForms'))
    expect(isScopeUsable(scope.getSnapshot())).toBe(true)
    // An empty override object is what the Host produces before any write.
    expect(scope.hasUserLayer(fakeSnapshot({}))).toBe(false)
    expect(scope.hasUserLayer(fakeSnapshot({ flavor: 'catppuccin-mocha' }))).toBe(true)
    expect(await scope.write([{ op: 'set', path: ['flavor'], value: 'off' }], 7)).toBe('accepted')
    // The fence is forwarded on THIS seam only.
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['flavor'], value: 'off' }], 7)
    await ctx.fiber.dispose()
  })

  it('binds the legacy scope, omits the fence and honours an absent user layer', async () => {
    const ctx = new Context()
    const { binder, mutate } = fakeLegacyScope()
    const scope = createDurableScope(ctx)
    ctx.provide('settingsScope', binder as never)
    await vi.waitFor(() => expect(scope.kind).toBe('settingsScope'))
    expect(isScopeUsable(scope.getSnapshot())).toBe(true)
    // The legacy document omits the field entirely when it holds no section…
    expect(scope.hasUserLayer(fakeSnapshot(undefined))).toBe(false)
    // …and an empty section IS a layer there (that line's shipped semantics).
    expect(scope.hasUserLayer(fakeSnapshot({}))).toBe(true)
    await scope.write([{ op: 'set', path: ['flavor'], value: 'off' }], 7)
    // No revision: the legacy controller resolves `pendingRevision ??
    // snapshot.revision` itself, and a forwarded older base would turn a
    // write that succeeds today into an unobservable loss.
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['flavor'], value: 'off' }])
    await ctx.fiber.dispose()
  })

  it('binds a service that arrives after apply (late publication)', async () => {
    const ctx = new Context()
    const scope = createDurableScope(ctx)
    const seen = vi.fn()
    scope.subscribe(seen)
    expect(scope.kind).toBe('none')
    const { form } = fakeForm()
    ctx.provide('configForms', { get: () => form } as never)
    await vi.waitFor(() => expect(scope.kind).toBe('configForms'))
    // The bind notifies subscribers so hydration re-runs.
    expect(seen).toHaveBeenCalled()
    expect(isScopeUsable(scope.getSnapshot())).toBe(true)
    await ctx.fiber.dispose()
    expect(scope.kind).toBe('none')
  })

  it('maps a refused write to refused and a thrown one to failed', async () => {
    const ctx = new Context()
    const { form } = fakeForm(false)
    const scope = createDurableScope(ctx)
    ctx.provide('configForms', { get: () => form } as never)
    await vi.waitFor(() => expect(scope.kind).toBe('configForms'))
    expect(await scope.write([], 1)).toBe('refused')
    await ctx.fiber.dispose()

    const offline = new Context()
    const throwing = {
      getSnapshot: () => fakeSnapshot({}),
      subscribe: () => () => {},
      mutate: async () => { throw new Error('offline') },
    }
    const offlineScope = createDurableScope(offline)
    offline.provide('configForms', { get: () => throwing } as never)
    await vi.waitFor(() => expect(offlineScope.kind).toBe('configForms'))
    expect(await offlineScope.write([], 1)).toBe('failed')
    await offline.fiber.dispose()
  })
})

describe('hasUserLayerSection', () => {
  it('accepts a non-empty object only', () => {
    expect(hasUserLayerSection({})).toBe(false)
    expect(hasUserLayerSection(undefined)).toBe(false)
    expect(hasUserLayerSection(null)).toBe(false)
    expect(hasUserLayerSection([])).toBe(false)
    expect(hasUserLayerSection({ flavor: 'off' })).toBe(true)
  })
})
