/**
 * Host half of the Catppuccin theme plugin for the DeepSeek Harness web GUI.
 *
 * Pure UI plugin: the empty apply exists so the plugin appears in the host
 * cordis.yml / Loader; the browser half ships via exports["./client"],
 * discovered through the package.json dsh.client declaration. The flavour
 * choice and the glass knobs persist in localStorage — the Host settings
 * wire only serves an explicit allowlist of namespaces (see
 * dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES), so a plugin-owned settings
 * namespace answers `settings-not-exposed` even when registered. A
 * browser-local visual preference therefore owns no host configuration.
 */

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'dsh-catppuccin'

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
