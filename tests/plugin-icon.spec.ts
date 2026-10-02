// @vitest-environment node
/**
 * Plugin-card icon contract: the Plugins page draws each bundle's artwork from
 * the Host's package metadata, which reads `package.json`'s `icon` field as a
 * **manifest-relative** file path and inlines it as a data URI
 * (`dsh-app-boot` → `iconOf()`). The Host enforces, in order: relative path only,
 * extension in {.svg,.png,.jpg,.jpeg,.webp}, the file resolving inside the
 * manifest directory, a regular file, and ≤ 256 KiB raw. Any breach throws at
 * metadata-read time — so a stale path or an oversized asset silently demotes the
 * card back to the default artwork (or worse, breaks the metadata read).
 *
 * These mirrors of the Host's rules are load-bearing: the icon is the one asset
 * whose only consumer lives upstream.
 */
import { readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Mirrors `MAX_ICON_BYTES` in `@deepseek-ai/dsh-app-boot` (`lib/types/package-meta.js`). */
const MAX_ICON_BYTES = 256 * 1024
/** Mirrors `ICON_MEDIA_TYPES` in the same module. */
const ICON_MEDIA_TYPES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
])

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = resolve(ROOT, 'package.json')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
  icon?: unknown
  files?: unknown
}

describe('plugin-card icon (Host package metadata)', () => {
  it('declares a manifest-relative icon path', () => {
    const icon = manifest.icon
    expect(typeof icon, 'package.json icon must be a string').toBe('string')
    const value = icon as string
    // The Host rejects absolute paths and any scheme (`C:\...`, `https://...`).
    expect(isAbsolute(value), `${value} must be relative`).toBe(false)
    expect(/^[A-Za-z][A-Za-z\d+.-]*:/u.test(value), `${value} must not carry a scheme`).toBe(false)
    expect(ICON_MEDIA_TYPES.has(extname(value).toLowerCase()), `${value} extension`).toBe(true)
  })

  it('points at an existing regular file inside the manifest directory', () => {
    const file = resolve(ROOT, manifest.icon as string)
    const local = relative(ROOT, file)
    expect(local === '..' || local.startsWith(`..${sep}`), `${local} must stay inside the package`).toBe(false)
    expect(statSync(file).isFile(), `${local} must be a regular file`).toBe(true)
  })

  it('stays within the Host 256 KiB admission limit', () => {
    const bytes = readFileSync(resolve(ROOT, manifest.icon as string))
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_ICON_BYTES)
    expect(bytes.byteLength, 'icon must not be empty').toBeGreaterThan(0)
  })

  it('ships the icon in the published tarball', () => {
    // The Host reads the installed package directory, so an asset left out of
    // `files` exists in the repo and vanishes in the tarball.
    const files = manifest.files
    expect(Array.isArray(files), 'package.json files must be an array').toBe(true)
    expect(files as string[]).toContain(manifest.icon as string)
  })

  it('is the PNG it claims to be', () => {
    const ext = extname(manifest.icon as string).toLowerCase()
    const bytes = readFileSync(resolve(ROOT, manifest.icon as string))
    if (ext === '.png') {
      // 89 50 4E 47 0D 0A 1A 0A — a payload with the wrong magic bytes still
      // inlines fine but renders as a broken image in the card.
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    }
  })
})
