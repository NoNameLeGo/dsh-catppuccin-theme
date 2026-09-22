// @vitest-environment node
/**
 * E2E (item EE): boots the REAL Host plugin in a real cordis application with
 * stub services (a webServer backed by a real node:http server, plus a
 * settings stub), then asserts the actual HTTP surface:
 *  - `/catppuccin/check-update` answers 200 with the settled JSON contract;
 *  - the registry lookup honors the `?channel=beta` preference (item I);
 *  - the 5-minute verdict cache is per-channel and serves re-opens without
 *    re-hitting npm;
 *  - the ETag conditional revalidation (item W) refreshes a stale-but-valid
 *    cache through a 304;
 *  - registry failures map to stable error codes and HTTP 502 (item U);
 *  - the settings namespace is registered (0.5.0 persistence seam).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { apply } from '../../src/index.ts'
import { UPDATE_ROUTE_PATH } from '../../src/update-check.ts'
import pkg from '../../package.json'

/** The real fetch, captured before the registry stub replaces the global. */
const realFetch = globalThis.fetch

/** In-memory fake npm registry behind the stub fetch. */
class FakeRegistry {
  calls: Array<{ url: string; init?: RequestInit }> = []
  constructor(private status: number, private readonly body: unknown, private readonly etag?: string) {}
  setStatus(status: number): void { this.status = status }
  reset(): void { this.calls = [] }
  async respond(url: string, init?: RequestInit): Promise<Response> {
    this.calls.push({ url, init })
    if (this.status === 304) {
      return {
        status: 304,
        ok: false,
        headers: { get: () => this.etag ?? null },
        json: async () => { throw new Error('304 has no body') },
      } as unknown as Response
    }
    return {
      status: this.status,
      ok: this.status >= 200 && this.status < 300,
      headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? this.etag ?? null : null) },
      json: async () => this.body,
    } as unknown as Response
  }
}

const registry = new FakeRegistry(200, {
  'dist-tags': { latest: '0.9.0', beta: '0.10.0-beta.1' },
}, '"v1"')

const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>()
const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://e2e.local').pathname
  const handler = routes.get(pathname)
  if (handler !== undefined) handler(req, res)
  else {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'not found' }))
  }
})

const installSection = vi.fn()
const settingsStub = {
  installSection,
  describe: () => [],
  update: async () => { /* noop */ },
}

let baseUrl = ''
const root = new Context()

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) =>
    registry.respond(String(url), init)) as unknown as typeof fetch)
  root.provide('webServer', {
    register(route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) {
      routes.set(route.path, (req, res) => { void route.handler(req, res) })
      return () => { routes.delete(route.path) }
    },
  })
  root.provide('settings', settingsStub)
  await root.plugin(apply)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await root.fiber.dispose()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  vi.unstubAllGlobals()
})

async function getJson(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await realFetch(`${baseUrl}${path}`, { headers: { accept: 'application/json' } })
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

/** Run `fn` with the route caches expired: advance a mocked clock past the
 *  5-minute TTL and keep the mocked Date active while `fn` runs, so the
 *  requests inside observe the expired cache AND their cache refreshes
 *  (Date.now) land in the same timeline (restoring the real clock first
 *  would un-expire the caches again). */
async function withExpiredCaches<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers()
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)
  try {
    return await fn()
  } finally {
    vi.useRealTimers()
  }
}

describe('e2e: host plugin on a real cordis app', () => {
  it('registers the catppuccin settings namespace through the settings service', async () => {
    await vi.waitFor(() => expect(installSection).toHaveBeenCalled())
    const [injectedCtx, ns] = installSection.mock.calls[0]
    expect(ns).toBe('catppuccin')
    expect(injectedCtx).toBeDefined()
  })

  it('answers the update-check route with the settled payload shape', async () => {
    registry.reset()
    const { status, body } = await getJson(UPDATE_ROUTE_PATH)
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.code).toBe('ok')
    expect(body.current).toBe(pkg.version)
    // The implicit channel follows the installed version: a stable install
    // checks `latest`, a prerelease install (package.json carries `-`) follows
    // `beta`. selectNewest then reports the newest tag of that channel.
    const preRelease = pkg.version.includes('-')
    expect(body.latest).toBe(preRelease ? '0.10.0-beta.1' : '0.9.0')
    expect(body.outdated).toBe(true)
    expect(body.channel).toBe(preRelease ? 'beta' : 'latest')
    expect(typeof body.updateCommand).toBe('string')
    expect(typeof body.profile).toBe('string')
    expect(typeof body.checkedAt).toBe('string')
  })

  it('an explicit ?channel=latest sticks to the stable tag', async () => {
    registry.reset()
    const { status, body } = await getJson(`${UPDATE_ROUTE_PATH}?channel=latest`)
    expect(status).toBe(200)
    expect(body.latest).toBe('0.9.0')
    expect(body.channel).toBe('latest')
    expect(body.updateCommand).toContain('@latest')
  })

  it('honors the ?channel=beta preference on the route (item I)', async () => {
    registry.reset()
    const { status, body } = await getJson(`${UPDATE_ROUTE_PATH}?channel=beta`)
    expect(status).toBe(200)
    expect(body.latest).toBe('0.10.0-beta.1')
    expect(body.channel).toBe('beta')
    // The upgrade command targets the beta dist-tag.
    expect(body.updateCommand).toContain('@beta')
  })

  it('serves repeat checks from the per-channel cache without re-hitting npm (item I/W)', async () => {
    registry.reset()
    await getJson(`${UPDATE_ROUTE_PATH}?channel=beta`) // warmed by the previous test
    await getJson(`${UPDATE_ROUTE_PATH}?channel=beta`)
    await getJson(UPDATE_ROUTE_PATH) // warmed by the shape test (different bucket)
    await getJson(UPDATE_ROUTE_PATH)
    expect(registry.calls).toHaveLength(0) // every hit served from a bucket
  })

  it('revalidates a stale cache through If-None-Match / 304 (item W)', async () => {
    registry.reset()
    registry.setStatus(304) // the registry now answers conditional requests with 304
    await withExpiredCaches(async () => {
      const { status, body } = await getJson(`${UPDATE_ROUTE_PATH}?channel=beta`)
      expect(status).toBe(200)
      expect(body.ok).toBe(true) // the cached verdict is re-served
      expect(body.latest).toBe('0.10.0-beta.1')
      expect(registry.calls).toHaveLength(1)
      const conditional = registry.calls[0].init?.headers as Record<string, string> | undefined
      expect(conditional?.['if-none-match']).toBe('"v1"')
      // A second request inside the refreshed window stays on the cache.
      await getJson(`${UPDATE_ROUTE_PATH}?channel=beta`)
      expect(registry.calls).toHaveLength(1)
    })
  })

  it('maps a registry outage to a stable code and HTTP 502 (item U)', async () => {
    registry.reset()
    registry.setStatus(500)
    const { status, body } = await withExpiredCaches(() => getJson(UPDATE_ROUTE_PATH))
    expect(status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.code).toBe('registry-http')
  })

  // Deliberately LAST: it warms the (default) cache bucket with a verdict stamped
  // under a far-advanced mocked clock, which would shadow the web-mode cases
  // above if it ran earlier.
  it('recognizes the OFFICIAL desktop shell by its env marker (2026-09-22)', async () => {
    // The official Electron shell (deepseek-harness/apps/desktop-host) boots the
    // `desktop` profile with DSH_DESKTOP_NODE_EXECUTABLE set and does NOT expose
    // the third-party launcher's `desktopProfiles` service — without this branch
    // the row falls back to the plain-web copy in official desktop builds.
    registry.reset()
    registry.setStatus(200)
    const previous = process.env.DSH_DESKTOP_NODE_EXECUTABLE
    process.env.DSH_DESKTOP_NODE_EXECUTABLE = process.execPath
    vi.useFakeTimers()
    try {
      // Far past every cached entry, including ones stamped by earlier cases
      // under their own mocked clocks (which sit in the future once the real
      // clock is restored).
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
      const { status, body } = await getJson(UPDATE_ROUTE_PATH)
      expect(status).toBe(200)
      expect(body.env).toBe('desktop')
      expect(typeof body.updateCommand).toBe('string')
      expect(typeof body.profile).toBe('string')
    } finally {
      vi.useRealTimers()
      if (previous === undefined) delete process.env.DSH_DESKTOP_NODE_EXECUTABLE
      else process.env.DSH_DESKTOP_NODE_EXECUTABLE = previous
    }
  })
})