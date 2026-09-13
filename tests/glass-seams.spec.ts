// @vitest-environment jsdom
/**
 * Seam stamper debounce (item N): the MutationObserver must coalesce a
 * burst of DOM mutations into ONE stamp pass per animation frame, and
 * nothing runs between frames (the dirty flag skips no-op stamps).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startGlassSeamStamper } from '../src/client/glass/glass-seams.ts'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/** One seam the stamper keys off (see glass-seams.ts SEAMS). */
function newSessionButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'newSession'
  document.body.append(button)
  return button
}

describe('startGlassSeamStamper (item N)', () => {
  it('stamps matching elements once at start', () => {
    const button = newSessionButton() // present BEFORE the stamper starts
    const dispose = startGlassSeamStamper()
    expect(button.hasAttribute('data-dsh-glass-surface')).toBe(true)
    dispose()
  })

  it('stamps the settings dialog overlay (issue #11 follow-up: settings glass)', () => {
    // The dialog is the only hook the stylesheet has to re-point the opaque
    // raised-surface tokens inside it; host class names are hash-prefixed, so
    // this test pins the selector dependency.
    const overlay = document.createElement('div')
    overlay.className = 'VOzbGW_overlay'
    document.body.append(overlay)
    const dispose = startGlassSeamStamper()
    expect(overlay.hasAttribute('data-dsh-glass-settings')).toBe(true)
    dispose()
  })

  it('batches a same-frame mutation burst into one stamp pass', async () => {
    vi.useFakeTimers()
    startGlassSeamStamper()
    const first = newSessionButton()
    const second = newSessionButton()
    const third = newSessionButton()
    // The mutation observer fired, but the rAF stamp has not run yet.
    expect(first.hasAttribute('data-dsh-glass-surface')).toBe(false)
    // One animation frame later every burst mutation is stamped.
    await vi.advanceTimersByTimeAsync(16)
    for (const button of [first, second, third]) {
      expect(button.hasAttribute('data-dsh-glass-surface')).toBe(true)
    }
  })

  it('does not re-stamp during frames without mutations', async () => {
    vi.useFakeTimers()
    const disposer = startGlassSeamStamper()
    const stampSpy = vi.spyOn(HTMLElement.prototype, 'setAttribute')
    // A frame without mutations and one with mutations: the empty frame
    // must not call setAttribute at all (dirty flag).
    await vi.advanceTimersByTimeAsync(16)
    expect(stampSpy).not.toHaveBeenCalled()
    newSessionButton()
    await vi.advanceTimersByTimeAsync(16)
    expect(stampSpy).toHaveBeenCalledWith('data-dsh-glass-surface', '')
    disposer()
  })

  it('dispose cancels the pending frame and disconnects the observer', async () => {
    vi.useFakeTimers()
    const disposer = startGlassSeamStamper()
    const button = newSessionButton() // schedules a frame
    disposer()
    await vi.advanceTimersByTimeAsync(16)
    expect(button.hasAttribute('data-dsh-glass-surface')).toBe(false) // frame cancelled
    const later = newSessionButton() // observer disconnected
    await vi.advanceTimersByTimeAsync(16)
    expect(later.hasAttribute('data-dsh-glass-surface')).toBe(false)
  })
})