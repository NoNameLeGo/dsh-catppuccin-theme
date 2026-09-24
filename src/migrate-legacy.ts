/**
 * One-shot migration of the pre-0.5.0 durable file into whichever settings
 * seam the running host offers (issue #15 split it out of `src/index.ts` so
 * the composition stays thin and the migration is unit-testable).
 *
 * The migration writes `$DSH_HOME/catppuccin-state.json` into the durable
 * store exactly once, and only while that store holds NO user layer yet — a
 * user who already configured through the official settings surface (or a
 * previous migration) is never overwritten. The legacy file is left on disk
 * untouched as a rollback copy; a corrupt or absent file means nothing to
 * migrate. Every failure is non-fatal.
 *
 * Two host shapes, two addressing rules:
 *
 *  - LEGACY (DSH <= 0.1.6-alpha.2): the namespace is one the plugin just
 *    registered itself, so `describe()` finds it immediately and the caller
 *    can run {@link migrateLegacyStateOnce} synchronously. "No user layer"
 *    arrives as an ABSENT `user` field.
 *  - NEW (DSH >= 0.1.7-alpha.1): the namespace IS the profile entry, and the
 *    settings service only lists an entry whose own fiber is ACTIVE. The
 *    `settings` inject callback fires SYNCHRONOUSLY when the service is
 *    already live — at that instant the entry is still activating, so an
 *    immediate `describe()` cannot see it and the migration would be silently
 *    skipped. {@link scheduleLegacyMigration} defers it and also retries on
 *    the entry's own `settings/document-updated`. Here "no user layer"
 *    arrives as an EMPTY OBJECT (`configEditor` defaults `override` to `{}`),
 *    which is why the predicate is injected rather than hard-coded.
 */
import type { Context } from '@deepseek-ai/cordis'
import { readLegacyState } from './legacy-state.ts'
import { isDefaultState, settingsSectionFromState } from './state.ts'

/** The settings-service surface this module needs — satisfied by both seams
 *  (`SettingsForms` on 0.1.7+, the document provider before it). */
export interface SettingsLike {
  /** Read the active namespaces (keyed by namespace / profile entry id). */
  describe(options?: { redactSecrets?: boolean }): readonly SettingsLikeDescriptor[]
  /** Merge a patch into one namespace's user layer. */
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
}

/** The descriptor fields this module reads. */
export interface SettingsLikeDescriptor {
  ns: string
  revision?: number
  user?: unknown
}

/** Outcome of one migration attempt. `pending` means "not yet addressable —
 *  try again", which is the only one the caller should retry. */
export type MigrationOutcome =
  /** The legacy state was written into the durable store. */
  | 'migrated'
  /** The legacy file is absent or already equals the shipped defaults. */
  | 'absent'
  /** The store already holds a user layer — never overwritten. */
  | 'skipped'
  /** The namespace is not addressable yet (entry still activating / service
   *  has not published its first describe). */
  | 'pending'

/** Options for one migration attempt. */
export interface MigrationOptions {
  /**
   * Send the descriptor's revision as the write fence. The NEW seam sets it
   * (its `update` validates the revision the caller read); the LEGACY seam
   * omits it, so that line's write stays exactly what 0.5.x issued and cannot
   * turn into a spurious conflict against a namespace only we write.
   */
  fence?: boolean
}

/**
 * Run the migration once.
 * @param settings - the live settings service.
 * @param ns - the namespace to write: `CATPPUCCIN_SETTINGS_NS` on the legacy
 *             seam, `CATPPUCCIN_ENTRY_ID` on the new one.
 * @param hasUserLayer - the channel's own "the store already holds a user
 *             layer" predicate (see the module header).
 * @param options - fence policy (see {@link MigrationOptions}).
 * @returns the outcome; only `pending` is worth retrying.
 */
export async function migrateLegacyStateOnce(
  settings: SettingsLike,
  ns: string,
  hasUserLayer: (user: unknown) => boolean,
  options: MigrationOptions = {},
): Promise<MigrationOutcome> {
  const legacy = readLegacyState()
  if (legacy === null || isDefaultState(legacy)) return 'absent'
  const descriptor = settings.describe({ redactSecrets: true })
    .find((candidate) => candidate.ns === ns)
  if (descriptor === undefined) return 'pending'
  if (hasUserLayer(descriptor.user)) return 'skipped'
  await settings.update(
    ns,
    settingsSectionFromState(legacy),
    options.fence === true ? descriptor.revision : undefined,
  )
  return 'migrated'
}

/**
 * Run the migration on the NEW seam without racing the plugin's own
 * activation: one deferred attempt, one retry when the entry's form finally
 * lands in the describe mirror, and one last attempt a few seconds later.
 * Bounded on purpose — a permanently missing entry (a user who renamed it)
 * must not leave a timer running for the process lifetime. The whole schedule
 * is fiber-scoped, so unloading the plugin cancels it.
 * @param ctx - the Host plugin context.
 * @param settings - the live settings service.
 * @param ns - the profile entry id carrying the form.
 * @param hasUserLayer - the new seam's user-layer predicate.
 */
export function scheduleLegacyMigration(
  ctx: Context,
  settings: SettingsLike,
  ns: string,
  hasUserLayer: (user: unknown) => boolean,
): void {
  let settled = false
  const attempt = (): void => {
    if (settled) return
    void migrateLegacyStateOnce(settings, ns, hasUserLayer, { fence: true })
      .then((outcome) => {
        if (outcome === 'pending') return
        settled = true
        if (outcome === 'migrated') {
          console.info(`[dsh-catppuccin] migrated the legacy state file into "${ns}"`)
        }
      })
      .catch((error: unknown) => {
        settled = true
        console.warn(`[dsh-catppuccin] legacy state migration failed: ${String(error)}`)
      })
  }
  ctx.effect(() => {
    const deferred = setTimeout(attempt, 0)
    const late = setTimeout(attempt, 3000)
    // The entry becomes addressable exactly when the settings service emits
    // its own document-changed notification for it.
    const off = ctx.on('settings/document-updated', (documentNs: string) => {
      if (String(documentNs) === ns) attempt()
    })
    return () => {
      clearTimeout(deferred)
      clearTimeout(late)
      off()
    }
  }, 'catppuccin: legacy state migration')
}
