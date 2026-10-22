import { describe, it, expect } from 'vitest'
import {
  BACKGROUND_KINDS,
  BACKGROUND_PALETTES,
  DEFAULT_BACKGROUND,
  backgroundHtmlAttributes,
  backgroundHtmlStyle,
  clampStrength,
  formatBackgroundCookie,
  lineOpacity,
  paletteColors,
  parseBackgroundCookie,
} from '../setting'

describe('defaults', () => {
  it('is faint indigo / pink lines at 10%', () => {
    expect(DEFAULT_BACKGROUND).toEqual({ kind: 'lines', strength: 10, palette: 'indigo-pink' })
  })
  it('labels the kinds and palettes as in the mockup', () => {
    expect(BACKGROUND_KINDS.map(k => k.label)).toEqual(['רגיל', 'קווים עדינים', 'סרטי צבע'])
    expect(BACKGROUND_PALETTES.map(p => p.label)).toEqual(['סגול ורוד', 'ים', 'אפור'])
  })
})

describe('parseBackgroundCookie', () => {
  it('reads a full value', () => {
    expect(parseBackgroundCookie('ribbons.22.ocean')).toEqual({ kind: 'ribbons', strength: 22, palette: 'ocean' })
    expect(parseBackgroundCookie('plain.4.grey')).toEqual({ kind: 'plain', strength: 4, palette: 'grey' })
  })
  it('reads an encoded value', () => {
    expect(parseBackgroundCookie(encodeURIComponent('lines.18.ocean'))).toEqual({ kind: 'lines', strength: 18, palette: 'ocean' })
  })
  it('defaults when missing or empty', () => {
    expect(parseBackgroundCookie(undefined)).toEqual(DEFAULT_BACKGROUND)
    expect(parseBackgroundCookie(null)).toEqual(DEFAULT_BACKGROUND)
    expect(parseBackgroundCookie('')).toEqual(DEFAULT_BACKGROUND)
  })
  it('defaults each unknown part on its own', () => {
    expect(parseBackgroundCookie('confetti.12.ocean')).toEqual({ kind: 'lines', strength: 12, palette: 'ocean' })
    expect(parseBackgroundCookie('ribbons.abc.ocean')).toEqual({ kind: 'ribbons', strength: 10, palette: 'ocean' })
    expect(parseBackgroundCookie('ribbons.12.neon')).toEqual({ kind: 'ribbons', strength: 12, palette: 'indigo-pink' })
    expect(parseBackgroundCookie('plain')).toEqual({ kind: 'plain', strength: 10, palette: 'indigo-pink' })
  })
  it('clamps the strength to 4-30', () => {
    expect(parseBackgroundCookie('lines.1.grey').strength).toBe(4)
    expect(parseBackgroundCookie('lines.99.grey').strength).toBe(30)
    expect(parseBackgroundCookie('lines.-5.grey').strength).toBe(10)
    expect(parseBackgroundCookie('lines.12.5.grey')).toEqual({ kind: 'lines', strength: 12, palette: 'indigo-pink' })
  })
  it('survives a broken escape', () => {
    expect(parseBackgroundCookie('%E0%A4%A')).toEqual(DEFAULT_BACKGROUND)
  })
})

describe('formatBackgroundCookie', () => {
  it('round-trips', () => {
    for (const kind of ['plain', 'lines', 'ribbons'] as const) {
      for (const palette of ['indigo-pink', 'ocean', 'grey'] as const) {
        const s = { kind, strength: 17, palette }
        expect(parseBackgroundCookie(formatBackgroundCookie(s))).toEqual(s)
      }
    }
  })
  it('writes a clamped strength', () => {
    expect(formatBackgroundCookie({ kind: 'lines', strength: 80, palette: 'grey' })).toBe('lines.30.grey')
  })
})

describe('helpers', () => {
  it('clampStrength rounds and bounds', () => {
    expect(clampStrength(9.6)).toBe(10)
    expect(clampStrength(0)).toBe(4)
    expect(clampStrength(31)).toBe(30)
    expect(clampStrength(Number.NaN)).toBe(10)
  })
  it('lineOpacity is the strength as a fraction', () => {
    expect(lineOpacity({ kind: 'lines', strength: 10, palette: 'grey' })).toBeCloseTo(0.1)
    expect(lineOpacity({ kind: 'lines', strength: 30, palette: 'grey' })).toBeCloseTo(0.3)
  })
  it('paletteColors: indigo / pink, lighter tints on dark pages', () => {
    expect(paletteColors('indigo-pink', false)).toEqual(['#4f46e5', '#d946ef'])
    expect(paletteColors('indigo-pink', true)).toEqual(['#818cf8', '#f0abfc'])
    expect(paletteColors('ocean', false)).toEqual(['#0369a1', '#0d9488'])
  })
  it('html attributes and style carry the setting', () => {
    const s = { kind: 'ribbons' as const, strength: 14, palette: 'grey' as const }
    expect(backgroundHtmlAttributes(s)).toEqual({ 'data-bg': 'ribbons', 'data-bg-palette': 'grey' })
    expect(backgroundHtmlStyle(s)).toEqual({ '--bg-strength': '0.14' })
  })
})
