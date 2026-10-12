/**
 * Fault-tolerant registration for the plugin's boot-critical wiring.
 *
 * Client and Host share one failure shape: an entry whose `apply()` throws is
 * marked `failed`, the assembly aborts the whole boot (`web boot: N entries
 * did not activate`), and the official desktop's crash rescue then runs
 * `disableAllPlugins()` — taking EVERY third-party plugin down with it. A peer
 * plugin already owning what we are about to register is the realistic
 * trigger (language packs and their BCP 47 ids — issue #23; a duplicate
 * install and its route / slot / theme ids), and the right answer to
 * "someone else already did this" is to skip OUR copy — never to fail the
 * boot. Full evidence chain and the per-call-site audit live in
 * `docs/issue-23-registration-tolerance.md`.
 *
 * Known "already owned" shapes are skipped quietly — the peer's registration
 * stands, matching `dsh-locale-pack`'s own tolerance. Anything else is logged
 * and skipped too: no registration in this plugin is worth the user's whole
 * plugin set. (To restore fail-fast for a class of errors, `throw error` in
 * the warn branch — every call site routes through here on purpose.)
 */

/** The "another party already owns this" messages the runtimes throw, checked
 *  against the 0.2.0-rc.2 sources (table in the doc's §6):
 *  - `locale "ja" is already registered` (dsh-client-locale addLanguage)
 *  - `locale namespace "…" already has locale "…"` (dsh-client-locale register)
 *  - `theme "…" is already registered` (dsh-client-ui-theme register)
 *  - `list slot "…" already has an entry with id "…"` (dsh-client-ui-slots)
 *  - `webserver: duplicate exact route "…"` (dsh-host-webserver register) */
const ALREADY_OWNED = /already (?:registered|has locale|has an entry)|duplicate .*route/u

/**
 * Run one registration call, degrading any failure to a no-op disposer.
 * @param run - the registration call, returning its disposer (if any).
 * @returns the real disposer, or a no-op when the registration was skipped.
 */
export function tolerantRegistration(run: () => (() => void) | void): () => void {
  try {
    return run() ?? (() => {})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!ALREADY_OWNED.test(message)) {
      console.warn(`[dsh-catppuccin] registration skipped — ${message}`)
    }
    return () => {}
  }
}
