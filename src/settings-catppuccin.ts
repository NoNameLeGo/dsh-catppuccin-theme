/**
 * The Catppuccin settings namespace — the official-settings shape of the
 * plugin's durable state (0.5.0+, replacing the legacy `catppuccin-state.json`).
 *
 * The namespace schema is registered Host-side (`src/index.ts`) so the Client
 * can bind it through `ctx.settingsScope` and persist through the Host's
 * settings document. The resolved value is the schema defaults, then the
 * composition `base` (none today — the plugin ships no entry config), then
 * the user document layer; the document lives under the DSH home where the
 * legacy file used to, so Desktop's per-launch random loopback port cannot
 * orphan it (same guarantee, official transport).
 *
 * This module is Host-side because it imports `@deepseek-ai/schemastery`
 * (resolved from the DSH profile tree at runtime). The Client never imports
 * it; it consumes the namespace by name through the mirror.
 */
import Schema from '@deepseek-ai/schemastery'
import {
  CATPPUCCIN_SETTINGS_NS,
  CATPPUCCIN_THEME_IDS,
  DEFAULT_GLASS,
  defaultSettingsSection,
  type CatppuccinSettingsSection,
} from './state.ts'

export { CATPPUCCIN_SETTINGS_NS }

/**
 * The schemastery schema resolving the namespace's value. Every field maps
 * 1:1 onto the shared contract in `src/state.ts`; `defaultSettingsSection()`
 * is the composition `base` registered alongside it, so an absent user
 * section resolves to the shipped defaults.
 */
export const CatppuccinSettingsSchema = Schema.object({
  flavor: Schema.union([...CATPPUCCIN_THEME_IDS, 'off']).default('off'),
  glass: Schema.object({
    enabled: Schema.boolean().default(DEFAULT_GLASS.enabled),
    mode: Schema.union(['mica', 'compat']).default(DEFAULT_GLASS.mode),
    blur: Schema.number().min(0).max(40).default(DEFAULT_GLASS.blur),
    frost: Schema.number().min(0).max(100).default(DEFAULT_GLASS.frost),
    brightness: Schema.number().min(0).max(100).default(DEFAULT_GLASS.brightness),
  }),
})

/** The composition `base` for the namespace: the shipped defaults. */
export const CATPPUCCIN_SETTINGS_BASE: CatppuccinSettingsSection = defaultSettingsSection()