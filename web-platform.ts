/**
 * Shared browser platform modules — OUR MIRROR of the DSH shell's frozen
 * module table (upstream `packages/client/web/src/platform.ts`,
 * `PLATFORM_MODULES`). Seeding, bundling externals, and Vite aliases consume
 * that one list upstream so module identities cannot drift; this copy exists
 * because our client bundle is built outside the DSH monorepo and must answer
 * the same table.
 *
 * `tsdown.client.ts` consumes it as `CLIENT_EXTERNALS`: every entry stays an
 * external `require()` resolved from the page's module table, and the bundle
 * purity gate rejects a cross-plugin VALUE import of anything that is NOT in
 * this list (a `require()` the frozen table cannot answer is a guaranteed
 * runtime throw, so failing the build is the point).
 *
 * ## Re-verifying (do this whenever you touch it, or after a DSH minor bump)
 *
 * ```bash
 * gh api "repos/deepseek-ai/deepseek-harness/contents/packages/client/web/src/platform.ts?ref=<tag>" \
 *   --jq '.content' | base64 -d
 * ```
 *
 * Verified 2026-09-24 against `dsh-v0.1.2-rc.1`, `dsh-v0.1.5-rc.3`,
 * `dsh-v0.1.6-alpha.2`, `dsh-v0.1.7-alpha.1`, `dsh-v0.1.7-rc.1` and `master`:
 * the table below is IDENTICAL in every version we support (`v0.1.5-rc.3`
 * through `v0.1.7-rc.1`); only `v0.1.2-rc.1` predates `dsh-client-ui-dockkit`.
 *
 * The list carried two retired specifiers until 2026-09-24
 * (`dsh-client-web-react`, `dsh-client-schema-form` — both stopped at
 * `0.1.0-rc.7` and are absent from every version of the upstream table) and was
 * missing the two live ones (`dsh-client-store` since `v0.1.2-rc.1`,
 * `dsh-client-ui-dockkit` since `v0.1.5-rc.3`).
 *
 * It caused no build or runtime failure: the client imports exactly one value
 * from this table (`react` / `react/jsx-runtime`). The cost was a wrong
 * mirror — a value import of `dsh-client-store` or `dsh-client-ui-dockkit`
 * would have been rejected by the purity gate as "not a platform module",
 * and importing either retired name would have produced a `require()` the real
 * table cannot answer.
 *
 * @module @deepseek-ai/dsh-client-web/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]
