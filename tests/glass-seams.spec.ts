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

  it('stamps the settings dialog overlay by its accessible attributes (issue #11 follow-up)', () => {
    // The dialog is the only hook the stylesheet has to re-point the opaque
    // raised-surface tokens inside it. The selector keys off the panel's
    // role/aria-modal instead of the host's CSS-module build hash, which
    // changes whenever the host stylesheet does.
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'presentation')
    const panel = document.createElement('div')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    overlay.append(panel)
    // A plain dialog (no aria-modal) must NOT be stamped — the seam is the
    // settings dialog, not every dialog in the app.
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    document.body.append(overlay, other)
    const dispose = startGlassSeamStamper()
    expect(overlay.hasAttribute('data-dsh-glass-settings')).toBe(true)
    expect(other.hasAttribute('data-dsh-glass-settings')).toBe(false)
    dispose()
  })

  it('batches a same-frame mutation burst into one stamp pass', async () => {
    vi.useFakeTimers()
    const disposer = startGlassSeamStamper()
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
    // Leaving this stamper alive would keep observing documentElement and
    // stamp the buttons of every later test in this file (…: the dispose
    // assertions in the last case then flake depending on frame ordering).
    disposer()
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
    stampSpy.mockRestore()
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