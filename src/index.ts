/**
 * Host half of the Catppuccin theme plugin for the DeepSeek Harness web GUI.
 *
 * The browser half registers four themes (catppuccin-latte / -frappe /
 * -macchiato / -mocha) into the official ThemeRuntime. The official
 * Appearance row only persists the built-in light/dark/system preferences,
 * so the user's flavour choice is persisted here under the `dsh-catppuccin`
 * settings namespace, and the browser half restores it on boot.
 */
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'

/** Settings namespace owning the persisted Catppuccin flavour choice. */
export const CATPPUCCIN_SETTINGS_NS = settingsNamespace('dsh-catppuccin')

/**
 * Accepted flavour values — the four registered theme ids plus `off`. These
 * MUST stay in sync with the browser half's `CATPPUCCIN_FLAVORS[].themeId`
 * (guarded by tests/palettes.spec.ts) because the persisted value is the
 * theme id itself.
 */
export const CATPPUCCIN_FLAVOR_VALUES = [
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'off',
] as const

/** Flavour key persisted in the user-settings document. */
export interface CatppuccinSettings {
  /** Selected Catppuccin flavour, or `off` to fall back to the official theme. */
  flavor: (typeof CATPPUCCIN_FLAVOR_VALUES)[number]
}

/** Durable settings schema; also the wire envelope the browser scope validates against. */
export const CatppuccinSettingsSchema = z.object({
  flavor: z.union([...CATPPUCCIN_FLAVOR_VALUES]).default('off'),
})

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'dsh-catppuccin'

/** Required services: the settings provider for the durable flavour section. */
export const inject = ['settings']

/**
 * Register the Catppuccin settings namespace so the browser scope can persist
 * the flavour choice. Registration is an effect on this fiber; disposing the
 * fiber removes the namespace.
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  installSettingsSection(ctx, CATPPUCCIN_SETTINGS_NS, CatppuccinSettingsSchema, {}, {
    setSource: () => {},
    onChange: () => {},
  })
}
