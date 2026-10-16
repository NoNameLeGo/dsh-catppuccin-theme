// @vitest-environment jsdom
/**
 * GlassLayer cross-tab wiring (audit F1, 2026-09-22).
 *
 * The layer's settings/knobs live in localStorage, so a `storage` event from
 * another tab must re-read them and republish the row snapshot. The handler
 * matched the numeric knobs with `event.key in NUMERIC_KEYS`, which tests the
 * object's PROPERTY NAMES (`blur`/`frost`/`brightness`) — never the
 * `dsh.catppuccin.glass.*` storage keys the event actually carries — so the
 * branch was dead and cross-tab knob changes were silently ignored while the
 * `===`-compared mode key kept working. These cases walk each branch of that
 * handler so the next such typo cannot hide behind a passing suite.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GLASS_ENABLED_KEY, GlassLayer } from '../src/client/glass/glass-layer.ts'

const BLUR_KEY = 'dsh.catppuccin.glass.blur'
const MODE_KEY = 'dsh.catppuccin.glass.mode'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.innerHTML = ''
})

afterEach(() => {
  localStorage.clear()
})

/** Minimal client context: effect() runs the body, on() never fires. */
function fakeCtx() {
  return {
    effect: (fn: () => unknown) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    on: () => () => {},
    theme: { getTheme: () => ({ preference: 'system', active: { colorScheme: 'dark' } }) },
  } as never
}

/** Reproduce what the browser does on a cross-tab write of `key`. */
function crossTabWrite(key: string, value: string): void {
  localStorage.setItem(key, value)
  window.dispatchEvent(new StorageEvent('storage', { key }))
}

describe('GlassLayer storage-event wiring (audit F1)', () => {
  it('re-reads and republishes when a numeric knob changes in another tab', () => {
    const layer = new GlassLayer(fakeCtx())
    const notified: number[] = []
    layer.subscribe(() => notified.push(layer.getSnapshot().blur))
    expect(layer.getSnapshot().blur).toBe(5) // shipped default

    crossTabWrite(BLUR_KEY, '24')

    expect(layer.getSnapshot().blur).toBe(24)
    expect(notified).toEqual([24]) // the settings row must re-render too
  })

  it('tracks every numeric knob, not just blur', () => {
    const layer = new GlassLayer(fakeCtx())
    crossTabWrite('dsh.catppuccin.glass.frost', '45')
    crossTabWrite('dsh.catppuccin.glass.brightness', '80')
    const snapshot = layer.getSnapshot()
    expect(snapshot.frost).toBe(45)
    expect(snapshot.brightness).toBe(80)
  })

  it('tracks the glow switch too (issue #26)', () => {
    const layer = new GlassLayer(fakeCtx())
    expect(layer.getSnapshot().glow).toBe(false) // shipped default: wash only
    // The knob only reaches the DOM while the layer is mounted (applySettings is
    // gated on the enable flag), matching every other knob.
    crossTabWrite(GLASS_ENABLED_KEY, 'true')
    crossTabWrite('dsh.catppuccin.glass.glow', 'true')
    expect(layer.getSnapshot().glow).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--dsh-glass-glow')).toBe('1')
    crossTabWrite('dsh.catppuccin.glass.glow', 'false')
    expect(document.documentElement.style.getPropertyValue('--dsh-glass-glow')).toBe('0')
  })

  it('keeps the mode and enable-flag branches working', () => {
    const layer = new GlassLayer(fakeCtx())

    crossTabWrite(MODE_KEY, 'compat')
    expect(layer.getSnapshot().mode).toBe('compat')

    // Enabling from another tab mounts the layer without a reload.
    crossTabWrite(GLASS_ENABLED_KEY, 'true')
    expect(layer.getSnapshot().enabled).toBe(true)
    expect(document.documentElement.hasAttribute('data-dsh-glass')).toBe(true)

    crossTabWrite(GLASS_ENABLED_KEY, 'false')
    expect(layer.getSnapshot().enabled).toBe(false)
    expect(document.documentElement.hasAttribute('data-dsh-glass')).toBe(false)
  })

  it('treats a null-key event (storage.clear() elsewhere) as a full reload', () => {
    const layer = new GlassLayer(fakeCtx())
    localStorage.setItem(BLUR_KEY, '17')
    localStorage.setItem(GLASS_ENABLED_KEY, 'true')
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(layer.getSnapshot().blur).toBe(17)
    expect(layer.getSnapshot().enabled).toBe(true)
  })

  it('ignores unrelated storage keys', () => {
    const layer = new GlassLayer(fakeCtx())
    const before = layer.getSnapshot()
    crossTabWrite('dsh.catppuccin.flavor', 'catppuccin-mocha')
    expect(layer.getSnapshot()).toBe(before) // same reference — nothing republished
  })

  it('mirrors the knobs onto <body> so the desktop caption probe re-reads (option C)', () => {
    // The official shell (`syncWindowsAppearance` in `lib/preload-app.cjs`)
    // re-reads its caption colour only when <body>'s style attribute or the
    // <head> subtree mutates — and its first read lands with the plugin's
    // <style> tag, before the mode attributes exist. The mirror is what makes
    // the probe see the mica caption override at mount, and what carries a
    // slider move to the native title bar afterwards.
    document.documentElement.append(document.createElement('body'))
    const body = document.body
    expect(body).not.toBeNull()
    const layer = new GlassLayer(fakeCtx())
    expect(body!.style.getPropertyValue('--dsh-glass-frost')).toBe('') // off: no mirror

    crossTabWrite(GLASS_ENABLED_KEY, 'true')
    // Identical to <html>'s value — the mirror must not become a second source.
    for (const property of [
      '--dsh-glass-blur',
      '--dsh-glass-frost',
      '--dsh-glass-brightness-black',
      '--dsh-glass-brightness-white',
      '--dsh-glass-glow',
    ]) {
      expect(body!.style.getPropertyValue(property)).toBe(
        document.documentElement.style.getPropertyValue(property),
      )
    }
    expect(body!.style.getPropertyValue('--dsh-glass-frost')).toBe('0.4') // 20 / 50

    crossTabWrite('dsh.catppuccin.glass.frost', '45')
    crossTabWrite('dsh.catppuccin.glass.glow', 'true')
    expect(body!.style.getPropertyValue('--dsh-glass-frost')).toBe('0.9')
    expect(body!.style.getPropertyValue('--dsh-glass-glow')).toBe('1')

    // Disabling the layer clears the mirror: with the mode attributes gone the
    // caption override no longer applies, and this style mutation is what makes
    // the shell re-read the theme's own fill instead of keeping the mica colour.
    crossTabWrite(GLASS_ENABLED_KEY, 'false')
    expect(body!.style.getPropertyValue('--dsh-glass-frost')).toBe('')
    expect(body!.style.getPropertyValue('--dsh-glass-glow')).toBe('')
  })
})
