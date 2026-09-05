/**
 * Host half of the update-check feature (extracted from `src/index.ts` —
 * item A). Owns the exact webServer route, the npm registry lookup, the
 * short-TTL verdict cache, the ETag conditional-request cache (item W), and
 * the channel preference parsed from the query string (item I).
 *
 * The Client settings row fetches this same-origin route and renders the
 * verdict; every move the route makes (semver comparison, channel choice,
 * profile probe) happens here so the Client never parses versions or
 * guesses profile names.
 */
import type { Context } from '@deepseek-ai/cordis'
import pkg from '../../package.json'
import {
  REGISTRY_PACKUMENT_URL,
  UPDATE_FETCH_TIMEOUT_MS,
  UPDATE_ROUTE_PATH,
  selectNewest,
  updateCommandFor,
  type UpdateChannel,
  type UpdateCheckPayload,
  type UpdateEnv,
} from '../update-check.ts'
import { isUpdateAvailable } from '../versions.ts'
import { detectProfile } from '../profile-detect.ts'

// Minimal structural types for the parts of node:http and the webServer
// service this plugin touches. The host bundle resolves cordis and friends
// from the profile tree at runtime and ships no @types/node, so the route
// contract is spelled out locally instead of imported.
interface HttpRequestLike {
  url?: string
  method?: string
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown
  on(event: 'end', listener: () => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}
interface HttpResponseLike {
  writeHead(status: number, headers: Record<string, string>): void
  end(body?: string): void
}
interface WebRouteLike {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: HttpRequestLike, res: HttpResponseLike) => void | Promise<void>
}
interface WebServerLike {
  register(route: WebRouteLike): () => void
}

/** Minimal structural type for DSH Desktop's public `desktopProfiles` service
 *  (the host bundle ships no dsh-plugin-desktop types). */
interface DesktopProfilesLike {
  readonly current?: {
    readonly name: string
    readonly dir?: string
  }
}

/** Query-string channel preference (item I): `?channel=beta` chases the
 *  beta tag from a stable install; anything else keeps the install-derived
 *  channel logic of `selectNewest`. */
function parseChannel(url: string | undefined): UpdateChannel | undefined {
  if (url === undefined) return undefined
  try {
    const channel = new URL(url, 'http://dsh.localhost').searchParams.get('channel')
    return channel === 'beta' ? 'beta' : channel === 'latest' ? 'latest' : undefined
  } catch {
    return undefined
  }
}

function sendJson(res: HttpResponseLike, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** Result of one registry lookup: an OK payload, a 304 not-modified (serve
 *  the cached verdict), or an error payload (never cached). */
type FetchResult =
  | { kind: 'ok'; payload: UpdateCheckPayload; etag?: string }
  | { kind: 'not-modified' }
  | { kind: 'error'; payload: UpdateCheckPayload }

/** Query the npm registry and build the check payload. The probe result
 *  feeds the upgrade command's profile name and the install-source copy, so
 *  the Client never guesses either. Under DSH Desktop the target profile is
 *  `desktopProfiles.current` (launcher-resolved, authoritative), so the
 *  copied command targets the right profile there too.
 *
 * Failure classification (item U): a timed-out lookup (the abort fired) is
 *  `network.upstream` — the npm registry is temporarily unavailable; a
 *  fetch that throws outright (DNS / connection refused) stays
 *  `registry-unreachable`; the 304 conditional path (item W) revalidates
 *  the cached verdict without pulling the full packument again. */
async function fetchLatestVersion(options: {
  env: UpdateEnv
  channel?: UpdateChannel
  etag?: string
  desktopProfile?: DesktopProfilesLike['current']
}): Promise<FetchResult> {
  const current = pkg.version
  const probe = await detectProfile(
    options.desktopProfile !== undefined ? { desktopProfile: options.desktopProfile } : {},
  )
  const base = {
    current,
    env: options.env,
    profile: probe.name,
    profileDetected: probe.detected,
    installSource: probe.installSource,
    checkedAt: new Date().toISOString(),
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(REGISTRY_PACKUMENT_URL, {
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.npm.install-v1+json',
        // Item W: conditional request — a 304 answer revalidates the cached
        // verdict without pulling the full packument again.
        ...(options.etag !== undefined ? { 'if-none-match': options.etag } : {}),
      },
    })
  } catch (error) {
    const timedOut = controller.signal.aborted
    return {
      kind: 'error',
      payload: {
        ...base,
        ok: false,
        code: timedOut ? 'network.upstream' : 'registry-unreachable',
        error: error instanceof Error ? error.message : String(error),
      },
    }
  } finally {
    clearTimeout(timer)
  }
  // 304: the registry's own cache says our cached verdict is still current.
  if (response.status === 304) return { kind: 'not-modified' }
  if (!response.ok) {
    return {
      kind: 'error',
      payload: {
        ...base,
        ok: false,
        code: 'registry-http',
        error: `npm registry responded HTTP ${response.status}`,
      },
    }
  }
  let data: { 'dist-tags'?: Record<string, string> }
  try {
    data = await response.json() as { 'dist-tags'?: Record<string, string> }
  } catch {
    return {
      kind: 'error',
      payload: { ...base, ok: false, code: 'invalid-response', error: 'npm registry returned an unparseable packument' },
    }
  }
  const newest = selectNewest(current, data['dist-tags'] ?? {}, options.channel)
  if (newest === null) {
    return {
      kind: 'error',
      payload: { ...base, ok: false, code: 'no-dist-tags', error: 'npm registry returned no usable dist-tags' },
    }
  }
  const outdated = isUpdateAvailable(current, newest.version)
  const etag = response.headers.get('etag') ?? undefined
  return {
    kind: 'ok',
    ...(etag !== undefined ? { etag } : {}),
    payload: {
      ...base,
      ok: true,
      code: 'ok',
      latest: newest.version,
      outdated,
      channel: newest.channel,
      ...(outdated ? { updateCommand: updateCommandFor(newest.channel, probe.name) } : {}),
    },
  }
}

/** Short TTL for the cached registry verdict: repeated checks (settings row
 *  re-opened, user re-clicks) don't re-hit npm; failures stay uncached so the
 *  next click retries for real. The ETag (item W) lets a stale-but-valid
 *  cache refresh itself with a conditional request instead of a full
 *  packument pull — npm traffic drops to one 304 per 5 minutes.
 *
 *  The cache is keyed by the requested channel (item I): switching the row's
 *  channel must produce the new channel's verdict, not a stale cached one. */
const UPDATE_CACHE_TTL_MS = 5 * 60 * 1000

interface UpdateCacheEntry {
  at: number
  etag?: string
  payload: UpdateCheckPayload
}

/** Channel cache buckets. No query param and an explicit channel select
 *  differently for a prerelease install (`selectNewest` only chases beta
 *  without a preference), so the default bucket is DISTINCT from `latest` —
 *  a pinned-latest check must never serve a beta verdict from the
 *  unopinionated bucket (and vice versa). */
type CacheBucket = 'default' | UpdateChannel

const updateCaches = new Map<CacheBucket, UpdateCacheEntry>()

function cacheKeyOf(channel: UpdateChannel | undefined): CacheBucket {
  return channel ?? 'default'
}

/** Answer the update-check route with the JSON contract from update-check.ts.
 *  Probes the optional `desktopProfiles` service: when it is live this Host
 *  runs inside DSH Desktop, so the copy adapts (target profile =
 *  `desktopProfiles.current`, Desktop-flavoured hints). Otherwise it is the
 *  standard dsh web/CLI route and the web copy + profile scan apply.
 *
 *  The route itself is stateless about retries: item V's 30s auto-retry is
 *  scheduled by the settings row (an immediate route retry would just hang
 *  a manual click); once a failure has passed the 5-minute window, the next
 *  request re-runs the lookup for real. */
async function handleUpdateCheck(ctx: Context, req: HttpRequestLike, res: HttpResponseLike): Promise<void> {
  const channel = parseChannel(req.url)
  const key = cacheKeyOf(channel)
  const entry = updateCaches.get(key)
  if (entry !== undefined && Date.now() - entry.at < UPDATE_CACHE_TTL_MS) {
    sendJson(res, 200, entry.payload)
    return
  }
  const desktopProfiles = ctx.get('desktopProfiles') as DesktopProfilesLike | undefined
  const current = desktopProfiles?.current
  const isDesktop = current?.name !== undefined && current.name !== ''
  const result = await fetchLatestVersion({
    env: isDesktop ? 'desktop' : 'web',
    channel,
    ...(entry?.etag !== undefined ? { etag: entry.etag } : {}),
    ...(isDesktop ? { desktopProfile: current } : {}),
  })
  if (result.kind === 'ok') {
    updateCaches.set(key, { at: Date.now(), payload: result.payload, ...(result.etag !== undefined ? { etag: result.etag } : {}) })
    sendJson(res, 200, result.payload)
    return
  }
  if (result.kind === 'not-modified') {
    // The registry 304'd our conditional request: refresh the cache window
    // and serve the stored verdict (item W). A cache is guaranteed here —
    // we only send If-None-Match when one exists.
    if (entry !== undefined) updateCaches.set(key, { ...entry, at: Date.now() })
    const cached = entry?.payload
    if (cached !== undefined) {
      sendJson(res, 200, cached)
      return
    }
  }
  // Registry failure (or the unreachable not-modified-without-cache
  // combination): the error payload is never cached, so the next check
  // retries for real.
  sendJson(res, 502, result.kind === 'error'
    ? result.payload
    : { ok: false, code: 'invalid-response', error: 'registry state inconsistency' } as UpdateCheckPayload)
}

/** Register the update-check route on the owning context. `webServer` is a
 *  hard inject dependency of the Host plugin, so it is guaranteed live when
 *  this runs — mounting can never race ahead of the service. */
export function registerUpdateCheckRoute(ctx: Context): void {
  const webServer = ctx.get('webServer') as WebServerLike
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: UPDATE_ROUTE_PATH,
    handler: (req, res) => void handleUpdateCheck(ctx, req, res),
  }), 'dsh-catppuccin: update-check route')
}