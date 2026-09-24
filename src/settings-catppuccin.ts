/**
 * The Catppuccin settings contract — the official-settings shape of the
 * plugin's durable state (0.5.0+, replacing the legacy
 * `catppuccin-state.json`), in BOTH forms the DSH versions in the wild need.
 *
 * Two seams, one contract (issue #15):
 *
 *  - **DSH <= 0.1.6-alpha.2** (`latest` on npm) serves an abstract settings
 *    document. The Host half registers a namespace on it
 *    (`settings.installSection(CATPPUCCIN_SETTINGS_NS, schema, base, hooks)`)
 *    and the Client binds that namespace through `ctx.settingsScope`. This
 *    module owns the registered schema ({@link CatppuccinSettingsSchema}) and
 *    the composition `base` ({@link CATPPUCCIN_SETTINGS_BASE}).
 *  - **DSH >= 0.1.7-alpha.1** (`next`) dropped both. A plugin no longer
 *    registers a namespace: it declares a `Config` schema whose fields carry
 *    `.volatile()`, and the settings service projects exactly those fields
 *    into a form named by the ACTIVE PROFILE ENTRY id
 *    (`CATPPUCCIN_ENTRY_ID`). That projected schema is {@link Config}, the
 *    module's only export the Loader consumes.
 *
 * Both forms are built from ONE field table ({@link catppuccinSchemaFields}),
 * so a field can never drift between them. They must NOT share node
 * instances: `.volatile()` mutates the node's meta in place and returns it,
 * so reusing a node would silently mark the legacy schema volatile as well.
 *
 * {@link maybeVolatile} is the compatibility hinge: `.volatile()` exists only
 * from schemastery **3.18.3** (DSH 0.1.5/0.1.6 hosts pin `3.18.2`), and this
 * module is loaded with the HOST's schemastery (it stays external in the lib
 * build). An unconditional `.volatile()` would therefore throw at module
 * evaluation time on every old host — turning "plugin pending" into "plugin
 * failed to load". On such a host the guarded call is a no-op, which is
 * exactly the pre-0.1.7 status quo (no entry-level form exists there).
 *
 * This module is Host-side because it imports `@deepseek-ai/schemastery`
 * (resolved from the DSH profile tree at runtime). The Client never imports
 * it; it consumes the form by name.
 */
import Schema from '@deepseek-ai/schemastery'
import {
  CATPPUCCIN_THEME_IDS,
  DEFAULT_AUTO_CHECK,
  DEFAULT_GLASS,
  DEFAULT_SHIKI_STYLE,
  DEFAULT_UPDATE_CHANNEL,
  defaultSettingsSection,
  type CatppuccinSettingsSection,
} from './state.ts'

/** The subset of a schemastery node this module relies on. */
interface VolatileCapable {
  volatile?: () => unknown
}

/**
 * Mark a schema node volatile when the running schemastery supports it.
 *
 * Guarded on purpose (see the module header): `.volatile()` landed in
 * schemastery 3.18.3, while DSH <= 0.1.6-alpha.2 hosts pin 3.18.2 and this
 * module resolves schemastery from THEIR tree. Calling it unconditionally
 * throws at import time on those hosts.
 * @param node - freshly built schema node (never reused across schemas).
 * @returns the same node, marked volatile when the capability exists.
 */
export function maybeVolatile<T extends object>(node: T): T {
  const capable = node as VolatileCapable
  return typeof capable.volatile === 'function' ? capable.volatile() as T : node
}

/**
 * Build FRESH schema nodes for every field of the durable contract. Every
 * field maps 1:1 onto `CatppuccinSettingsSection` in `src/state.ts`, and every
 * default is the shipped default — the Client treats "resolves to the shipped
 * defaults" as "no user choice yet", so a wrong default would write garbage
 * into a user's profile on first boot.
 *
 * Callers MUST NOT share the returned nodes between schemas (see the header).
 * @returns a new field table, one fresh node per field.
 */
export function catppuccinSchemaFields(): Record<string, Schema> {
  return {
    flavor: Schema.union([...CATPPUCCIN_THEME_IDS, 'off']).default('off'),
    glass: Schema.object({
      enabled: Schema.boolean().default(DEFAULT_GLASS.enabled),
      mode: Schema.union(['mica', 'compat']).default(DEFAULT_GLASS.mode),
      blur: Schema.number().min(0).max(40).default(DEFAULT_GLASS.blur),
      frost: Schema.number().min(0).max(100).default(DEFAULT_GLASS.frost),
      brightness: Schema.number().min(0).max(100).default(DEFAULT_GLASS.brightness),
    }),
    autoCheck: Schema.boolean().default(DEFAULT_AUTO_CHECK),
    updateChannel: Schema.union(['latest', 'beta']).default(DEFAULT_UPDATE_CHANNEL),
    overrides: Schema.dict(Schema.string()).default({}),
    shikiStyle: Schema.union(['default', 'italic-comments']).default(DEFAULT_SHIKI_STYLE),
  }
}

/** The same table with every leaf marked volatile where the capability exists.
 *  Marking the leaves (rather than the `glass` subtree) keeps
 *  `isVolatilePath` true for each nested path without putting volatile inside
 *  volatile — schemastery rejects that combination. */
function volatileFields(): Record<string, Schema> {
  const fields = catppuccinSchemaFields()
  const glassFields = (fields.glass as Schema & { dict?: Record<string, Schema> }).dict ?? {}
  return {
    flavor: maybeVolatile(fields.flavor),
    glass: Schema.object(Object.fromEntries(
      Object.entries(glassFields).map(([key, node]) => [key, maybeVolatile(node)]),
    )),
    autoCheck: maybeVolatile(fields.autoCheck),
    updateChannel: maybeVolatile(fields.updateChannel),
    overrides: maybeVolatile(fields.overrides),
    shikiStyle: maybeVolatile(fields.shikiStyle),
  }
}

/**
 * The namespace schema registered by the LEGACY Host seam
 * (`settings.installSection`). Deliberately plain: on a host that has
 * `installSection` there is no `.volatile()` capability, and the field set is
 * resolved by the settings document rather than by a form projection.
 */
export const CatppuccinSettingsSchema = Schema.object(catppuccinSchemaFields())

/** The composition `base` for the legacy namespace: the shipped defaults. */
export const CATPPUCCIN_SETTINGS_BASE: CatppuccinSettingsSection = defaultSettingsSection()

/**
 * The plugin `Config` consumed by the NEW Host seam (DSH >= 0.1.7-alpha.1).
 * Its volatile fields are what the settings service projects into the form the
 * Client addresses by `CATPPUCCIN_ENTRY_ID`; the Host half never reads the
 * values itself. On a legacy host every field stays plain, so the entry
 * exposes no form at all — the old seam keeps doing the persisting.
 */
export const Config = Schema.object(volatileFields())

/**
 * The value shape the Loader hands `apply` for {@link Config}. Every leaf is a
 * `Volatile` reference on a 0.1.7 host (read it with `.get()`); the Host half
 * deliberately consumes none of them, so this interface exists to document the
 * contract and to keep the schema honest.
 */
export interface CatppuccinConfig {
  flavor: { get(): CatppuccinSettingsSection['flavor'] }
  glass: {
    enabled: { get(): boolean }
    mode: { get(): CatppuccinSettingsSection['glass']['mode'] }
    blur: { get(): number }
    frost: { get(): number }
    brightness: { get(): number }
  }
  autoCheck: { get(): boolean }
  updateChannel: { get(): CatppuccinSettingsSection['updateChannel'] }
  overrides: { get(): Record<string, string> }
  shikiStyle: { get(): CatppuccinSettingsSection['shikiStyle'] }
}
