// @vitest-environment node
/**
 * Locale balance guard (item CC): the zh dictionary is the key-set source of
 * truth — every other language must mirror its key set exactly. A drift here
 * would leave settings rows with untranslated or dangling keys for that
 * language (the locale lookup falls back per key, so the breakage would be
 * silent).
 */
import { describe, expect, it } from 'vitest'
import { de, en, es, fr, ja, ko, zh } from '../src/client/locales.ts'

const LANGUAGES = { en, ja, ko, es, fr, de } as const

describe('locale dictionaries (item CC)', () => {
  it('every language mirrors the zh key set exactly', () => {
    const zhKeys = Object.keys(zh).sort()
    expect(zhKeys.length).toBeGreaterThan(0)
    for (const [id, dict] of Object.entries(LANGUAGES)) {
      const keys = Object.keys(dict).sort()
      expect(keys, `${id} key set`).toEqual(zhKeys)
    }
  })

  it('every dictionary value is a non-empty string', () => {
    for (const [id, dict] of Object.entries(LANGUAGES)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${id}.${key}`).toBe('string')
        expect(value.length, `${id}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('the new copy keys exist everywhere (help / subtitles / prefs / conflict)', () => {    const key = (k: keyof typeof zh): boolean => k in zh
    expect(key('row.help')).toBe(true)
    expect(key('glass.help')).toBe(true)
    expect(key('update.help')).toBe(true)
    expect(key('flavor.mocha.subtitle')).toBe(true)
    expect(key('update.autoCheck')).toBe(true)
    expect(key('update.channelBeta')).toBe(true)
    expect(key('update.conflict')).toBe(true)
    expect(key('update.err.networkLocal')).toBe(true)
    expect(key('update.err.networkUpstream')).toBe(true)
    for (const [id, dict] of Object.entries(LANGUAGES)) {
      expect(dict['flavor.mocha.subtitle']).not.toBe('')
      expect(dict['update.err.networkLocal']).not.toBe(undefined)
    }
  })

  it('the frost knob and its preset stay in one word family per language (2026-09-21)', () => {
    // ja used to label the knob 曇り but the preset フォグ, and ko 프로스트 vs 포그 —
    // the same concept split across two words inside one row, which reads as a
    // translation slip (found by audit 2026-09-21; see docs/locale-review.md).
    // Native quality cannot be asserted, but this split can: one of the two labels
    // must be a prefix of the other (case + diacritics stripped — that still allows
    // fr Givre/Givré, en Frost/Frosted, zh 磨砂/磨砂度).
    const plain = (text: string): string =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    for (const [id, dict] of Object.entries({ zh, ...LANGUAGES })) {
      const knob = plain(dict['glass.frost'])
      const preset = plain(dict['glass.presetFrosted'])
      expect(
        knob.startsWith(preset) || preset.startsWith(knob),
        `${id}: knob(${dict['glass.frost']}) and preset(${dict['glass.presetFrosted']}) are different words`,
      ).toBe(true)
    }
  })

  it('glass.help names every preset label it advertises (2026-09-21)', () => {
    // Renaming a preset silently staled the help tooltip (the ja/ko frost fix had
    // to update both); this keeps the prose and the three labels coupled.
    const PRESETS = ['glass.presetClear', 'glass.presetStandard', 'glass.presetFrosted'] as const
    for (const [id, dict] of Object.entries({ zh, ...LANGUAGES })) {
      for (const key of PRESETS) {
        expect(dict['glass.help'].includes(dict[key]), `${id}: glass.help must name ${key} (${dict[key]})`).toBe(true)
      }
    }
  })
})