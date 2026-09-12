// @vitest-environment jsdom
/**
 * Shared settings controls — the roving-focus index math behind the segmented
 * pick (the WAI-ARIA pattern: arrows move focus without selecting, Home/End
 * jump). Kept pure so the clamping and the unknown-id fallback are locked
 * without a DOM; the rows themselves are exercised in the browser.
 */
import { describe, expect, it } from 'vitest'
import { segmentedTargetIndex } from '../src/client/controls.tsx'

const OPTIONS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as const

describe('segmentedTargetIndex', () => {
  it('moves one option and clamps at both ends', () => {
    expect(segmentedTargetIndex('a', 1, OPTIONS)).toBe(1)
    expect(segmentedTargetIndex('b', 1, OPTIONS)).toBe(2)
    expect(segmentedTargetIndex('c', 1, OPTIONS)).toBe(2)
    expect(segmentedTargetIndex('a', -1, OPTIONS)).toBe(0)
    expect(segmentedTargetIndex('b', -1, OPTIONS)).toBe(0)
  })

  it('jumps to the first / last option for Home / End', () => {
    expect(segmentedTargetIndex('b', 'home', OPTIONS)).toBe(0)
    expect(segmentedTargetIndex('b', 'end', OPTIONS)).toBe(2)
  })

  it('falls back to the first option when the current id is not in the pick', () => {
    // A stale value (e.g. a preset that no longer matches any option) must
    // still focus something instead of returning -1.
    expect(segmentedTargetIndex('', 1, OPTIONS)).toBe(1)
    expect(segmentedTargetIndex('gone', 1, OPTIONS)).toBe(1)
    expect(segmentedTargetIndex('gone', -1, OPTIONS)).toBe(0)
  })
})
