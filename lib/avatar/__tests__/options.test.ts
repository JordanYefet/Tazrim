import { describe, expect, it } from 'vitest'
import { avatarFontSize, avatarLines, nameInitial, validateAvatar } from '../options'
import { parseAvatar } from '@/lib/preferences/avatar'

describe('avatarLines', () => {
  it('breaks a long text at the space nearest the middle', () => {
    expect(avatarLines('אמא של נועה')).toEqual(['אמא של', 'נועה'])
    expect(avatarLines('סבתא רחל')).toEqual(['סבתא', 'רחל'])
  })
  it('keeps one line when short or without a space', () => {
    expect(avatarLines('Dana12345678')).toEqual(['Dana12345678'])
    expect(avatarLines('ד')).toEqual(['ד'])
    expect(avatarLines('a b c')).toEqual(['a b c'])
  })
})

describe('avatarFontSize', () => {
  it('shrinks with the longest line and grows for two lines', () => {
    expect(avatarFontSize('ד', 100)).toBe(46)
    expect(avatarFontSize('Dana12345678', 100)).toBe(10)
    expect(avatarFontSize('אמא של נועה', 100)).toBe(Math.round(100 * 0.18 * 1.15))
  })
})

describe('validateAvatar', () => {
  const art = { kind: 'art', set: 'lorelei', seed: 'noa', bg: 2 }
  it('accepts art and text', () => {
    expect(validateAvatar(art)).toEqual(art)
    expect(validateAvatar({ kind: 'text', text: '  ד  ', ink: 7, bg: 0 })).toEqual({ kind: 'text', text: 'ד', ink: 7, bg: 0 })
  })
  it('rejects bad art', () => {
    for (const bad of [{ ...art, set: 'bottts' }, { ...art, seed: 'zzz' }, { ...art, bg: 10 }, { ...art, bg: -1 }, { ...art, bg: 1.5 }]) {
      expect(validateAvatar(bad)).toBeNull()
    }
  })
  it('rejects bad text', () => {
    const t = { kind: 'text', text: 'ד', ink: 0, bg: 0 }
    for (const bad of [{ ...t, text: '' }, { ...t, text: '   ' }, { ...t, text: 'x'.repeat(13) }, { ...t, text: 'a\nb' }, { ...t, ink: 8 }, { ...t, text: 5 }]) {
      expect(validateAvatar(bad)).toBeNull()
    }
    expect(validateAvatar({ ...t, text: '😀'.repeat(12) })).not.toBeNull()
  })
  it('rejects other shapes', () => {
    for (const bad of [null, 'x', 3, {}, { kind: 'photo' }]) expect(validateAvatar(bad)).toBeNull()
  })
})

describe('parseAvatar', () => {
  it('reads stored JSON, null for junk or nothing', () => {
    expect(parseAvatar(JSON.stringify({ kind: 'text', text: 'ד', ink: 1, bg: 1 }))).toEqual({ kind: 'text', text: 'ד', ink: 1, bg: 1 })
    expect(parseAvatar('{nope')).toBeNull()
    expect(parseAvatar(null)).toBeNull()
  })
})

describe('nameInitial (the fallback with no avatar)', () => {
  it('is the first character', () => {
    expect(nameInitial(' דנה')).toBe('ד')
    expect(nameInitial('')).toBe('?')
  })
})
