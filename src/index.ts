/**
 * Host half of the Catppuccin theme plugin for the DeepSeek Harness web GUI.
 *
 * Pure UI plugin: the four flavour themes and the glass skin ship in the
 * browser half (exports["./client"], discovered through the package.json
 * dsh.client declaration), and the flavour/glass preferences persist in
 * localStorage — the Host settings wire only serves an explicit allowlist of
 * namespaces (see dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES), so a
 * plugin-owned settings namespace would answer `settings-not-exposed` even
 * when registered.
 *
 * The one host-side behavior is the update check: an exact webServer route
 * (`/catppuccin/check-update`) that queries the npm registry for the latest
 * published version, compares it against this package's own manifest version
 * with a dependency-free semver comparator, and answers the JSON contract in
 * `src/update-check.ts`. The route exists only when the composition actually
 * provides the `webServer` service (the web shape does; a headless profile
 * simply gets no route and the settings row reports a check failure). The
 * response carries only public package metadata plus this package's own
 * version, so no workspace gate is needed.
 */
import type { Context } from '@deepseek-ai/cordis'
import pkg from '../package.json'
import {
  REGISTRY_PACKUMENT_URL,
  UPDATE_FETCH_TIMEOUT_MS,
  UPDATE_ROUTE_PATH,
  selectNewest,
  updateCommandFor,
  type UpdateCheckPayload,
} from './update-check.ts'
import { isUpdateAvailable } from './versions.ts'
import { detectProfile } from './profile-detect.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'dsh-catppuccin'

// Minimal structural types for the parts of node:http and the webServer
// service this plugin touches. The host bundle resolves cordis and friends
// from the profile tree at runtime and ships no @types/node, so the route
// contract is spelled out locally instead of imported.
interface HttpRequestLike {
  url?: string
  method?: string
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

/** Query the npm registry and build the check payload. The probe result
 *  feeds the upgrade command's profile name and the install-source copy, so
 *  the Client never guesses either. */
async function fetchLatestVersion(): Promise<UpdateCheckPayload> {
  const current = pkg.version
  const probe = await detectProfile()
  const base = {
    current,
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

/** Answer the update-check route with the JSON contract from update-check.ts. */
async function handleUpdateCheck(_req: HttpRequestLike, res: HttpResponseLike): Promise<void> {
  const payload = await fetchLatestVersion()
  res.writeHead(payload.ok ? 200 : 502, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** Host plugin body: register the update-check route when a webServer exists. */
export function apply(ctx: Context): void {
  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: UPDATE_ROUTE_PATH,
    handler: handleUpdateCheck,
  }), 'dsh-catppuccin: update-check route')
}
