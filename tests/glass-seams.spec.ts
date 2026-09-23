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

  it('stamps the right panel by its data attribute, not a renamed column class (0.1.7 audit)', () => {
    // The layout column flipped `detailsCol` -> `rightbarCol` in 0.1.5-rc.2
    // (ui-layout AppFrame.module.css). The panel under it carries no `root`
    // class (ui-sidebar-right ships .session / .panel) — the tab views inside
    // do, so the old descendant selector used to land on whichever content view
    // was open instead of the panel. The stable hook is
    // `data-sidebar-right-panel` (SidebarRight.tsx).
    const col = document.createElement('div')
    col.className = 'AppFrame_rightbarCol_abc'
    const panel = document.createElement('div')
    panel.className = 'SidebarRight_panel_xyz'
    panel.setAttribute('data-sidebar-right-panel', 'push')
    col.append(panel)
    document.body.append(col)
    const dispose = startGlassSeamStamper()
    expect(panel.hasAttribute('data-dsh-glass-details')).toBe(true)
    dispose()
  })

  it('still stamps a legacy details column (through 0.1.2-rc.1 layouts)', () => {
    const col = document.createElement('div')
    col.className = 'AppFrame_detailsCol_abc'
    const root = document.createElement('div')
    root.className = 'Details_root_xyz'
    col.append(root)
    document.body.append(col)
    const dispose = startGlassSeamStamper()
    expect(root.hasAttribute('data-dsh-glass-details')).toBe(true)
    dispose()
  })

  it('stamps the stats row inside the composer dock slot (both host shapes)', () => {
    // Real markup: the slot renders the entry with no wrapper, and StatsPills'
    // own root is `<div class="…root…" data-composer-stats>` — same in
    // 0.1.5-rc.2 and 0.1.7.
    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'conversation.composer.dock')
    const row = document.createElement('div')
    row.className = 'StatsPills_root_abc'
    row.setAttribute('data-composer-stats', '')
    slot.append(row)
    document.body.append(slot)
    const dispose = startGlassSeamStamper()
    expect(row.hasAttribute('data-dsh-glass-stats')).toBe(true)
    dispose()
  })

  it('still stamps the dock row when the host drops the root class', () => {
    // `> *` is the position-based fallback: the same element today, and it keeps
    // working if that class name ever changes.
    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'conversation.composer.dock')
    const row = document.createElement('div')
    row.className = 'SomethingElse_xyz'
    slot.append(row)
    document.body.append(slot)
    const dispose = startGlassSeamStamper()
    expect(row.hasAttribute('data-dsh-glass-stats')).toBe(true)
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