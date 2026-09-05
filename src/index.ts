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
 * The one host-side behavior besides the settings namespace is the
 * `/catppuccin/check-update` exact webServer route, owned by
 * `src/update-check/host.ts` (item A: the update-check logic used to live
 * inline here; it moved so `index.ts` stays a thin composition of the two
 * host responsibilities and the route module can be tested on its own).
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
import { registerUpdateCheckRoute } from './update-check/host.ts'
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
  registerUpdateCheckRoute(ctx)

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