// @vitest-environment jsdom
/**
 * Removing the pre-paint palette (issue #30 補充, 2026-10-27).
 *
 * The Host injects a `html body`-scoped `<style>` so the first frame is the
 * persisted flavour. That scope outranks the official `body` token block, so a
 * sheet that outlives the boot interval pins every token — the user picks Light
 * or turns the flavour off and nothing changes. These cases pin the removal
 * itself and the wiring that makes it happen on a normal boot.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FLAVOR_STORAGE_KEY, apply } from '../src/client/index.ts'
import { clearBootPalette } from '../src/client/boot-palette.ts'
import { BOOT_PALETTE_ATTR } from '../src/boot-palette.ts'

function injectSheet(): HTMLStyleElement {
  const sheet = document.createElement('style')
  sheet.setAttribute(BOOT_PALETTE_ATTR, '')
  sheet.textContent = 'html body{--dsw-static-blue-500:#1e66f5}'
  document.head.append(sheet)
  return sheet
}

const marked = (): Element | null => document.querySelector(`[${BOOT_PALETTE_ATTR}]`)

describe('clearBootPalette', () => {
  beforeEach(() => { for (const el of document.querySelectorAll(`[${BOOT_PALETTE_ATTR}]`)) el.remove() })

  it('removes every injected sheet and reports whether it did anything', () => {
    expect(clearBootPalette()).toBe(false)
    injectSheet()
    injectSheet()
    expect(clearBootPalette()).toBe(true)
    expect(marked()).toBeNull()
    expect(clearBootPalette()).toBe(false)
  })

  it('leaves stylesheets it does not own alone', () => {
    const other = document.createElement('style')
    other.textContent = ':root{color-scheme:dark}'
    document.head.append(other)
    injectSheet()
    clearBootPalette()
    expect(other.isConnected).toBe(true)
    other.remove()
  })
})

describe('the boot restore retires the pre-paint palette', () => {
  // A minimal faithful ThemeRuntime double: `setTheme` applies synchronously,
  // which is what lets the plugin clear the sheet from inside the wrapper.
  const makeRuntime = () => {
    const themes = [
      { id: 'light', colorScheme: 'light', tokens: {} },
      { id: 'dark', colorScheme: 'dark', tokens: {} },
    ] as { id: string; colorScheme: string; tokens: Record<string, unknown> }[]
    const runtime = {
      themes,
      preference: 'system',
      revision: 0,
      getTheme: () => ({ preference: runtime.preference, revision: runtime.revision, active: { colorScheme: 'dark' } }),
      setTheme: (id: string) => {
        if (id !== 'system' && !themes.some((theme) => theme.id === id)) throw new Error(`unknown theme ${id}`)
        runtime.preference = id
        runtime.revision += 1
      },
      register: (def: { id: string; colorScheme: string; tokens: Record<string, unknown> }) => {
        themes.push(def)
        return () => { /* the plugin disposes through its own fiber */ }
      },
    }
    return runtime
  }

  const mount = (): { preference: () => string } => {
    const ctx = new Context()
    const runtime = makeRuntime()
    Object.assign(ctx, {})
    ctx.provide('theme', runtime as never)
    ctx.provide('slots', { inject: () => () => {}, register: () => () => {} } as never)
    ctx.provide('locale', {
      register: () => () => {},
      addLanguage: () => () => {},
      bind: () => (key: string) => key,
    } as never)
    apply(ctx as never)
    return { preference: () => runtime.preference }
  }

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    for (const el of document.querySelectorAll(`[${BOOT_PALETTE_ATTR}]`)) el.remove()
  })

  it('drops the sheet once the persisted flavour is applied', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    injectSheet()
    const { preference } = mount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(preference()).toBe('catppuccin-mocha')
    expect(marked()).toBeNull()
  })

  it('drops it for an explicit off, where no flavour will take over', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'off')
    injectSheet()
    mount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(marked()).toBeNull()
  })

  it('is a no-op when the Host injected nothing (pre-0.6.6 / flavor off hosts)', async () => {
    localStorage.setItem(FLAVOR_STORAGE_KEY, 'catppuccin-mocha')
    const { preference } = mount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(preference()).toBe('catppuccin-mocha')
    expect(marked()).toBeNull()
  })
})
