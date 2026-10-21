import { describe, expect, it } from 'vitest'
import {
  AA,
  ACCOUNT_PALETTE,
  contrast,
  faceFromColor,
  INK_DARK,
  INK_LIGHT,
  inkFor,
  normalizeColorValue,
  parseColorChoice,
  seriesColor,
} from '../colors'
import { BANK_FACES, CARD_FACES, faceFor } from '../brands'

describe('normalizeColorValue', () => {
  it('keeps the brand default for empty values', () => {
    for (const v of [undefined, null, '', ' ', 'default', 'DEFAULT']) expect(normalizeColorValue(v)).toEqual({ ok: true, value: null })
  })

  it('accepts palette keys, glass and hex (lower-cased, #rgb expanded)', () => {
    expect(normalizeColorValue('Teal')).toEqual({ ok: true, value: 'teal' })
    expect(normalizeColorValue('glass')).toEqual({ ok: true, value: 'glass' })
    expect(normalizeColorValue('#A1B2C3')).toEqual({ ok: true, value: '#a1b2c3' })
    expect(normalizeColorValue('#abc')).toEqual({ ok: true, value: '#aabbcc' })
  })

  it('refuses anything else', () => {
    for (const v of ['purple-ish', '#12345', '#1234567', 'rgb(0,0,0)', 'red', 7, {}, true]) {
      expect(normalizeColorValue(v)).toEqual({ ok: false })
    }
  })
})

describe('parseColorChoice', () => {
  it('reads each kind, and unknown stored values as the default', () => {
    expect(parseColorChoice(null)).toEqual({ type: 'default' })
    expect(parseColorChoice('blue')).toMatchObject({ type: 'palette', key: 'blue' })
    expect(parseColorChoice('#123456')).toEqual({ type: 'custom', hex: '#123456' })
    expect(parseColorChoice('glass')).toEqual({ type: 'glass' })
    expect(parseColorChoice('nonsense')).toEqual({ type: 'default' })
  })
})

describe('faceFromColor keeps text AA on every stop', () => {
  const samples = [...ACCOUNT_PALETTE.map(p => p.hex), '#ffffff', '#000000', '#f2c6de', '#fff3b0', '#7f7f7f', '#00ff00', '#3388aa']
  for (const kind of ['CREDIT_CARD', 'BANK'] as const) {
    it(kind, () => {
      for (const hex of samples) {
        const { stops, ink } = faceFromColor(kind, hex)
        const text = ink === 'dark' ? INK_DARK : INK_LIGHT
        for (const stop of stops) expect(contrast(stop, text), `${hex} ${stop}`).toBeGreaterThanOrEqual(AA)
      }
    })
  }

  it('light colours get dark text, deep ones white', () => {
    expect(inkFor('#fff3b0')).toBe('dark')
    expect(inkFor('#f2c6de')).toBe('dark')
    expect(inkFor('#1a2b6e')).toBe('light')
  })
})

describe('faceFor with a chosen colour', () => {
  it('null falls back to the brand face (Leumi stays blue, Max its own)', () => {
    expect(faceFor('BANK', 'leumi', 'var(--chart-1)', null)).toBe(BANK_FACES.leumi)
    expect(faceFor('CREDIT_CARD', 'max', undefined, null)).toBe(CARD_FACES.max)
    expect(faceFor('CREDIT_CARD', 'max', undefined, 'not-a-colour')).toBe(CARD_FACES.max)
  })

  it('a swatch, custom colour or glass wins over the brand', () => {
    expect(faceFor('BANK', 'leumi', undefined, 'teal').key).toBe('color:#0f9b8e')
    expect(faceFor('CREDIT_CARD', 'max', undefined, '#f2c6de')).toMatchObject({ key: 'color:#f2c6de', ink: 'dark' })
    expect(faceFor('CREDIT_CARD', 'max', undefined, 'glass')).toMatchObject({ key: 'glass', glass: true })
  })
})

describe('seriesColor', () => {
  it('uses the chosen colour, a neutral for glass, else the positional fallback', () => {
    expect(seriesColor(null, 'var(--chart-cc)')).toBe('var(--chart-cc)')
    expect(seriesColor('violet', 'var(--chart-cc)')).toBe('#7c5ad8')
    expect(seriesColor('#3388aa', 'x')).toBe('#3388aa')
    expect(seriesColor('glass', 'x')).toBe('var(--acct-glass)')
  })

  it('keeps near-white and near-black custom colours visible on both themes', () => {
    expect(contrast(seriesColor('#ffffff', 'x'), '#ffffff')).toBeGreaterThanOrEqual(1.6)
    expect(contrast(seriesColor('#000000', 'x'), '#0b0d12')).toBeGreaterThanOrEqual(1.6)
  })
})
