// @vitest-environment node
/**
 * The client bundle's frozen module table must mirror the DSH shell's.
 *
 * `web-platform.ts` is a MIRROR of an upstream constant
 * (`packages/client/web/src/platform.ts`), so it cannot be derived locally —
 * it can only be checked. It had silently accumulated two retired specifiers
 * and was missing two live ones (found 2026-09-24), which is exactly the kind
 * of drift a comment cannot prevent.
 *
 * What these assertions pin:
 *  - the version-independent entries every supported DSH seeds;
 *  - the two live DSH entries, and the absence of the two retired ones;
 *  - that `tsdown.client.ts` still DERIVES its externals from the table
 *    (a hardcoded copy would defeat the mirror);
 *  - that the built bundle only ever requires specifiers the real table can
 *    answer — the one failure mode of a wrong list that reaches users.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLATFORM_MODULES } from '../web-platform.ts'
import { CLIENT_EXTERNALS } from '../tsdown.client.ts'

const repoFile = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

describe('PLATFORM_MODULES mirrors the DSH seed table', () => {
  it('has no duplicates', () => {
    expect(new Set(PLATFORM_MODULES).size).toBe(PLATFORM_MODULES.length)
  })

  it('carries the entries every supported DSH version seeds', () => {
    // Present in v0.1.2-rc.1 through v0.1.7-rc.1 (verified 2026-09-24).
    for (const specifier of [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ]) {
      expect(PLATFORM_MODULES).toContain(specifier)
    }
  })

  it('carries the live entries and none of the retired ones', () => {
    // `dsh-client-ui-dockkit` joined in v0.1.5-rc.3 and is in every later tag.
    expect(PLATFORM_MODULES).toContain('@deepseek-ai/dsh-client-ui-dockkit')
    // Both retired specifiers stopped at 0.1.0-rc.7 and appear in NO version of
    // the upstream table — keeping them made the purity gate reject the two
    // live packages while letting a dead name through to a runtime require().
    expect(PLATFORM_MODULES).not.toContain('@deepseek-ai/dsh-client-web-react')
    expect(PLATFORM_MODULES).not.toContain('@deepseek-ai/dsh-client-schema-form')
  })

  it('is the single source of the client bundle externals', () => {
    expect([...CLIENT_EXTERNALS]).toEqual([...PLATFORM_MODULES])
    // …and the build really reads it, rather than carrying its own copy.
    const build = repoFile('tsdown.client.ts')
    expect(build).toContain('export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]')
  })
})

describe('the built client bundle only requires answerable specifiers', () => {
  it('requires nothing outside the platform table', () => {
    const bundlePath = new URL('../lib/client.js', import.meta.url)
    // `pnpm install` runs the `prepare` build, so the artifact is present in
    // any checkout that can run this suite.
    expect(existsSync(bundlePath), 'lib/client.js missing — run `pnpm build` first').toBe(true)
    const source = readFileSync(bundlePath, 'utf8')
    const required = new Set(
      [...source.matchAll(/require\((["'])([^"']+)\1\)/g)].map((match) => match[2] as string),
    )
    expect(required.size).toBeGreaterThan(0)
    for (const specifier of required) {
      expect(PLATFORM_MODULES, `bundle requires "${specifier}", which the DSH table does not seed`)
        .toContain(specifier)
    }
  })
})
