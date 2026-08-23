/**
 * Host half of the Catppuccin theme plugin for the DeepSeek Harness web GUI.
 *
 * Pure UI plugin: the four flavour themes and the glass skin ship in the
 * browser half (exports["./client"], discovered through the package.json
 * dsh.client declaration). The flavour/glass preferences persist durably in a
 * small JSON file under the DSH home (`catppuccin-state.json`) served to the
 * Client through the `/catppuccin/state` route — necessary because DSH
 * Desktop restarts on a fresh random loopback port every launch, and
 * localStorage (scoped per origin including the port) cannot survive that
 * (browser localStorage stays only as the in-browser cache / cross-tab sync).
 * The Host settings wire is NOT used for either: it only serves an explicit
 * allowlist of namespaces (see dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES),
 * so a plugin-owned settings namespace would answer `settings-not-exposed`
 * even when registered.
 *
 * The two host-side behaviors are exact webServer routes (the same pattern
 * every working host plugin uses: dsh-ssh, client-hmr, client-connection):
 *   - `/catppuccin/check-update`: queries the npm registry for the latest
 *     published version, compares it against this package's own manifest
 *     version with a dependency-free semver comparator, and answers the JSON
 *     contract in `src/update-check.ts`;
 *   - `/catppuccin/state` (GET / PUT): the durable flavour + glass settings,
 *     read/written with `src/host-state.ts` (atomic JSON under `$DSH_HOME`).
 * `webServer` is a hard inject dependency, so Cordis starts this plugin only
 * after the service is live — mounting can never race ahead of it and
 * silently skip the routes. (An earlier version read `ctx.get('webServer')`
 * once and bailed silently when it was not yet visible, which left a
 * mounted-but-routeless plugin and made "check for updates" fail forever.)
 * A headless profile has no webServer and no settings UI, so the plugin
 * simply stays waiting there. The responses carry only the plugin's own
 * settings and public package metadata, so no workspace gate is needed.
 */
import type { Context } from '@deepseek-ai/cordis'
import pkg from '../package.json'
import { readDurableState, writeDurableState } from './host-state.ts'
import {
  REGISTRY_PACKUMENT_URL,
  UPDATE_FETCH_TIMEOUT_MS,
  UPDATE_ROUTE_PATH,
  selectNewest,
  updateCommandFor,
  type UpdateCheckPayload,
  type UpdateEnv,
} from './update-check.ts'
import { isUpdateAvailable } from './versions.ts'
import { detectProfile } from './profile-detect.ts'
import { STATE_ROUTE_PATH } from './state.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'dsh-catppuccin'

/**
 * Hard dependencies: the update check is a webServer route, so this Host
 * half is not activated until the webServer service is live. Declaring
 * inject (not a one-shot `ctx.get` probe) makes route registration
 * deterministic: Cordis reactivates the plugin once the service appears, no
 * matter the mount order.
 */
export const inject = ['webServer']

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

/** Query the npm registry and build the check payload. The probe result
 *  feeds the upgrade command's profile name and the install-source copy, so
 *  the Client never guesses either. Under DSH Desktop the target profile is
 *  `desktopProfiles.current` (launcher-resolved, authoritative), so the
 *  copied command targets the right profile there too. */
async function fetchLatestVersion(options: {
  env: UpdateEnv
  desktopProfile?: DesktopProfilesLike['current']
}): Promise<UpdateCheckPayload> {
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
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    })
  } catch (error) {
    return {
      ...base,
      ok: false,
      code: 'registry-unreachable',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    return {
      ...base,
      ok: false,
      code: 'registry-http',
      error: `npm registry responded HTTP ${response.status}`,
    }
  }
  let data: { 'dist-tags'?: Record<string, string> }
  try {
    data = await response.json() as { 'dist-tags'?: Record<string, string> }
  } catch {
    return { ...base, ok: false, code: 'invalid-response', error: 'npm registry returned an unparseable packument' }
  }
  const newest = selectNewest(current, data['dist-tags'] ?? {})
  if (newest === null) {
    return { ...base, ok: false, code: 'no-dist-tags', error: 'npm registry returned no usable dist-tags' }
  }
  const outdated = isUpdateAvailable(current, newest.version)
  return {
    ...base,
    ok: true,
    code: 'ok',
    latest: newest.version,
    outdated,
    channel: newest.channel,
    ...(outdated ? { updateCommand: updateCommandFor(newest.channel, probe.name) } : {}),
  }
}

/** Short TTL for the cached registry verdict: repeated checks (settings row
 *  re-opened, user re-clicks) don't re-hit npm; failures stay uncached so the
 *  next click retries for real. */
const UPDATE_CACHE_TTL_MS = 5 * 60 * 1000
let updateCache: { at: number; payload: UpdateCheckPayload } | undefined

/** Answer the update-check route with the JSON contract from update-check.ts.
 *  Probes the optional `desktopProfiles` service: when it is live this Host
 *  runs inside DSH Desktop, so the copy adapts (target profile =
 *  `desktopProfiles.current`, Desktop-flavoured hints). Otherwise it is the
 *  standard dsh web/CLI route and the web copy + profile scan apply. */
async function handleUpdateCheck(ctx: Context, _req: HttpRequestLike, res: HttpResponseLike): Promise<void> {
  if (updateCache !== undefined && Date.now() - updateCache.at < UPDATE_CACHE_TTL_MS) {
    sendJson(res, 200, updateCache.payload)
    return
  }
  const desktopProfiles = ctx.get('desktopProfiles') as DesktopProfilesLike | undefined
  const current = desktopProfiles?.current
  const isDesktop = current?.name !== undefined && current.name !== ''
  const payload = await fetchLatestVersion({
    env: isDesktop ? 'desktop' : 'web',
    ...(isDesktop ? { desktopProfile: current } : {}),
  })
  if (payload.ok) updateCache = { at: Date.now(), payload }
  sendJson(res, payload.ok ? 200 : 502, payload)
}

/** Soft cap on the durable-state write payload (a preference blob is tiny;
 *  anything larger is a malformed request). */
const STATE_BODY_LIMIT = 32 * 1024

/** Drain a request body as UTF-8 text, rejecting bodies over the cap.
 *  Once settled (over-cap or errored) further chunks are ignored — the
 *  promise is already answered and the buffers must not keep growing. */
function readRequestBody(req: HttpRequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let total = 0
    let settled = false
    req.on('data', (chunk: Uint8Array) => {
      if (settled) return
      total += chunk.byteLength
      if (total > STATE_BODY_LIMIT) {
        settled = true
        reject(new Error('state write body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      // Decode manually (no Buffer type in the structural contract):
      // node:http yields Uint8Array chunks, TextDecoder is a Node global.
      const decoder = new TextDecoder('utf-8')
      let text = ''
      for (const chunk of chunks) text += decoder.decode(chunk, { stream: true })
      text += decoder.decode()
      resolve(text)
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function sendJson(res: HttpResponseLike, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** GET /catppuccin/state — answer the durable state (null when never stored).
 *  Same origin as the GUI regardless of the (Desktop's random) loopback port,
 *  so the Client can read back the choice after every restart. */
function handleStateGet(_req: HttpRequestLike, res: HttpResponseLike): void {
  try {
    sendJson(res, 200, { ok: true, state: readDurableState() })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** PUT /catppuccin/state — validate and durably write the state. */
async function handleStatePut(req: HttpRequestLike, res: HttpResponseLike): Promise<void> {
  let raw: string
  try {
    raw = await readRequestBody(req)
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid-json' })
    return
  }
  try {
    // sanitizeState (inside writeDurableState) clamps and defaults every field,
    // so a hand-crafted payload can only ever write a valid state.
    writeDurableState(parsed as Parameters<typeof writeDurableState>[0])
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Host plugin body: register the update-check and durable-state routes
 *  (webServer is inject). */
export function apply(ctx: Context): void {
  // inject above guarantees the service is live when apply runs, so a plain
  // get can never come back undefined (the silent-skip failure mode this
  // plugin used to have). The cast is local typing only — the host bundle
  // ships no @types/node / web-profile Context merge.
  const webServer = ctx.get('webServer') as WebServerLike
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: UPDATE_ROUTE_PATH,
    handler: (req, res) => void handleUpdateCheck(ctx, req, res),
  }), 'dsh-catppuccin: update-check route')
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: STATE_ROUTE_PATH,
    handler: async (req, res) => {
      if (req.method === 'PUT') await handleStatePut(req, res)
      else handleStateGet(req, res)
    },
  }), 'dsh-catppuccin: durable-state route')
}
