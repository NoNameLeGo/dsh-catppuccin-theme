/**
 * Host half of the Catppuccin theme plugin for the DeepSeek Harness web GUI.
 *
 * Pure UI plugin: the four flavour themes and the glass skin ship in the
 * browser half (exports["./client"], discovered through the package.json
 * dsh.client declaration). Since 0.5.0 the flavour/glass preferences persist
 * durably through the OFFICIAL settings seam — but that seam changed shape in
 * DSH 0.1.7-alpha.1 (issue #15), so this half wires BOTH:
 *
 *  - **<= 0.1.6-alpha.2** (`latest` on npm): a settings SERVICE the plugin
 *    registers a namespace on (`ctx.settings.installSection`) and the Client
 *    binds through `ctx.settingsScope`.
 *  - **>= 0.1.7-alpha.1** (`next`): no registration at all. The plugin
 *    declares a `Config` schema with `.volatile()` fields (exported below),
 *    and the settings service projects them into a form named by the active
 *    profile entry id; the Client reads it through `ctx.configForms`.
 *
 * Which one is live is decided by FEATURE DETECTION, never by version parsing:
 * `installSection` is present exactly on the legacy service. Both wirings live
 * inside an optional `ctx.inject(['settings'], …)` child, so a deployment
 * without a settings provider keeps the plugin working from browser
 * localStorage alone (losing only cross-restart durability). No profile is
 * ever blocked on the settings service.
 *
 * The legacy seam itself predates DSH 0.1.1-rc.2, which is why 0.4.x shipped a
 * hand-rolled `$DSH_HOME/catppuccin-state.json` + `/catppuccin/state` route
 * instead: the Host settings wire then only served an explicit allowlist of
 * namespaces (see dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES), so a
 * plugin-owned settings namespace answered `settings-not-exposed` even when
 * registered. 0.1.1-rc.2 dropped the allowlist ("注册即暴露"), and the legacy
 * file is now only a one-shot migration source (`src/legacy-state.ts`,
 * consumed by `src/migrate-legacy.ts`; the file stays as rollback).
 *
 * The one host-side behavior besides settings is the
 * `/catppuccin/check-update` exact webServer route, owned by
 * `src/update-check/host.ts` (item A: the update-check logic used to live
 * inline here; it moved so `index.ts` stays a thin composition of the host
 * responsibilities and the route module can be tested on its own).
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
// Type-only: pulls the settings service's Context merge (ctx.settings).
import type {} from '@deepseek-ai/dsh-settings'
import { registerUpdateCheckRoute } from './update-check/host.ts'
import { migrateLegacyStateOnce, scheduleLegacyMigration, type SettingsLike } from './migrate-legacy.ts'
import { CATPPUCCIN_SETTINGS_BASE, CatppuccinSettingsSchema } from './settings-catppuccin.ts'
import { CATPPUCCIN_ENTRY_ID, CATPPUCCIN_SETTINGS_NS, hasUserLayerSection } from './state.ts'

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
 * The plugin's volatile configuration form (DSH >= 0.1.7-alpha.1) — the
 * namespace the Client addresses by `CATPPUCCIN_ENTRY_ID`.
 *
 * Re-exported here because the Loader reads `Config` off the plugin module;
 * on a legacy host the guarded `.volatile()` calls inside it are no-ops, so
 * the entry exposes no form there and the `installSection` wiring below keeps
 * doing the persisting.
 */
export { Config } from './settings-catppuccin.ts'

/**
 * The LEGACY settings service (DSH <= 0.1.6-alpha.2): it registers plugin
 * namespaces. Declared as a local structural type on purpose — 0.1.7 removed
 * the method from the published types, and this shape is all this branch
 * touches, so the cross-version code stays honest instead of reaching for
 * `any`.
 */
interface LegacySettings extends SettingsLike {
  installSection?: (
    owner: Context,
    ns: string,
    schema: unknown,
    base: unknown,
    hooks: { setSource: () => void, onChange: () => void },
  ) => void
}

/** The NEW settings service's extra surface (DSH >= 0.1.7-alpha.1). */
interface ModernSettings extends SettingsLike {
  /** Own this plugin instance's automatic-page policy (`auto` defaults true).
   *  Absent on the legacy seam, hence the feature detection. */
  configure?: (presentation: { auto?: boolean }, owner?: unknown) => unknown
}

/** The legacy document describes "no user layer" as an ABSENT field (it maps
 *  over the namespaces it has a section for), so presence is the whole test —
 *  the same predicate 0.5.x used. */
function legacyUserLayer(user: unknown): boolean {
  return user !== undefined
}

/** Host plugin body: register the update-check route and wire whichever
 *  settings seam the running host offers (webServer is inject; settings is
 *  optional wiring). */
export function apply(ctx: Context): void {
  registerUpdateCheckRoute(ctx)

  ctx.inject(['settings'], (sctx) => {
    const settings = sctx.settings as unknown as LegacySettings & ModernSettings
    if (typeof settings.installSection === 'function') {
      // Legacy seam. Registering and migrating inline reproduces 0.5.x
      // behaviour exactly: the namespace is ours, so it is addressable the
      // moment `installSection` returns, and the write stays unfenced.
      settings.installSection(
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
      void migrateLegacyStateOnce(settings, CATPPUCCIN_SETTINGS_NS, legacyUserLayer)
        .catch((error: unknown) => {
          console.warn(`[dsh-catppuccin] legacy state migration failed: ${String(error)}`)
        })
      return
    }

    // New seam. Nothing to register: the exported `Config` IS the namespace,
    // and its volatile fields are what the settings service projects into the
    // form the Client reads. Suppress the schema-generated page — this plugin
    // ships its own settings rows.
    settings.configure?.({ auto: false }, ctx.fiber)
    // The entry is not addressable until its own fiber is ACTIVE, so the
    // migration is deferred and retried rather than run inline (a synchronous
    // `describe()` here cannot see us yet — see `src/migrate-legacy.ts`).
    scheduleLegacyMigration(ctx, settings, CATPPUCCIN_ENTRY_ID, hasUserLayerSection)
  })
}
