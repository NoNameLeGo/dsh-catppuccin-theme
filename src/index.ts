/**
 * Host half of the Catppuccin theme plugin for the DeepSeek Harness web GUI.
 *
 * Pure UI plugin: the four flavour themes and the glass skin ship in the
 * browser half (exports["./client"], discovered through the package.json
 * dsh.client declaration). Since 0.5.0 the flavour/glass preferences persist
 * durably through the OFFICIAL settings seam: this half registers the
 * `catppuccin` settings namespace (`ctx.settings.installSection`, optional
 * wiring — see below), and the Client binds it through `ctx.settingsScope`.
 * That was not possible before DSH 0.1.1-rc.2, which is why 0.4.x shipped a
 * hand-rolled `$DSH_HOME/catppuccin-state.json` + `/catppuccin/state` route
 * instead: the Host settings wire then only served an explicit allowlist of
 * namespaces (see dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES), so a
 * plugin-owned settings namespace answered `settings-not-exposed` even when
 * registered. 0.1.1-rc.2 dropped the allowlist ("注册即暴露"), and the
 * legacy file is now only a one-shot migration source (`src/legacy-state.ts`,
 * read into the document on first registration; the file stays as rollback).
 *
 * Settings wiring is OPTIONAL on purpose: `installSection` registers the
 * namespace on the calling context while a settings service is live and falls
 * back to its `base` (the shipped defaults) when it is not, so a deployment
 * without a settings provider keeps the plugin working from browser
 * localStorage alone (losing only cross-restart durability). No profile is
 * ever blocked on the settings service.
 *
 * The two host-side behaviors are exact webServer routes (the same pattern
 * every working host plugin uses: dsh-ssh, client-hmr, client-connection):
 *   - `/catppuccin/check-update`: queries the npm registry for the latest
 *     published version, compares it against this package's own manifest
 *     version with a dependency-free semver comparator, and answers the JSON
 *     contract in `src/update-check.ts`.
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
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
// Type-only: pulls the settings service's Context merge (ctx.settings).
import type {} from '@deepseek-ai/dsh-settings'
import pkg from '../package.json'
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
import { readLegacyState } from './legacy-state.ts'
import {
  CATPPUCCIN_SETTINGS_BASE,
  CATPPUCCIN_SETTINGS_NS,
  CatppuccinSettingsSchema,
} from './settings-catppuccin.ts'
import { isDefaultState, settingsSectionFromState } from './state.ts'

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

function sendJson(res: HttpResponseLike, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/**
 * One-shot migration of the pre-0.5.0 durable file into the settings
 * document. Runs inside the settings wiring (see `apply`), right after the
 * namespace registration, and only writes when the document holds NO user
 * layer yet — a user who already configured through the official settings
 * surface (or a previous migration) is never overwritten. The legacy file is
 * left on disk untouched as a rollback copy; a corrupt or absent file means
 * nothing to migrate. Failure is non-fatal and logged through the rejection
 * (the document simply starts from the shipped defaults).
 */
function migrateLegacyStateOnce(settings: SettingsProvider): void {
  const legacy = readLegacyState()
  if (legacy === null || isDefaultState(legacy)) return
  const descriptor = settings.describe({ redactSecrets: true })
    .find((candidate) => candidate.ns === CATPPUCCIN_SETTINGS_NS)
  if (descriptor === undefined || descriptor.user !== undefined) return
  void settings.update(CATPPUCCIN_SETTINGS_NS, settingsSectionFromState(legacy)).catch((error: unknown) => {
    console.warn(`[dsh-catppuccin] legacy state migration failed: ${String(error)}`)
  })
}

/** Host plugin body: register the update-check route and the settings
 *  namespace (webServer is inject; settings is optional wiring). */
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

  // Official-settings persistence (0.5.0+). Optional on purpose: installSection
  // keeps the plugin running off the shipped defaults (and the Client's
  // localStorage) on deployments without a settings service, exactly the
  // "wait without crashing" contract of the old route-based storage.
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.installSection(
      sctx,
      CATPPUCCIN_SETTINGS_NS,
      CatppuccinSettingsSchema,
      CATPPUCCIN_SETTINGS_BASE,
      {
        // Host half never consumes the resolved value itself — the Client
        // renders and edits it through its own bound scope — so the source
        // sink and change hook are intentionally empty (the wiring still
        // needs them to keep the registration fiber-scoped).
        setSource() {},
        onChange() {},
      },
    )
    migrateLegacyStateOnce(sctx.settings)
  })
}