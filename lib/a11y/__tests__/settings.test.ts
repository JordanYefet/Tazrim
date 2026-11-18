import { describe, expect, it } from 'vitest'
import { A11Y_DEFAULTS, a11yAttribute, formatA11y, normalizeA11y, parseA11y } from '../settings'

describe('accessibility settings', () => {
  it('defaults: nothing on, no tokenes', () => {
    expect(parseA11y(undefined)).toEqual(A11Y_DEFAULTS)
    expect(a11yAttribute(A11Y_DEFAULTS)).toBe('')
  })

  it('maps every option to its token', () => {
    const all = { size: 150, font: true, bold: true, spacing: true, contrast: true, cb: true, still: true, focus: true, underline: true } as const
    expect(a11yAttribute(all).split(' ').sort()).toEqual(
      ['text-150', 'font', 'bold', 'spacing', 'contrast', 'cb', 'still', 'focus', 'underline'].sort()
    )
    expect(a11yAttribute({ ...A11Y_DEFAULTS, size: 115 })).toBe('text-115')
  })

  it('round-trips through its stored text', () => {
    const s = { ...A11Y_DEFAULTS, size: 130 as const, cb: true }
    expect(parseA11y(formatA11y(s))).toEqual(s)
  })

  it('bad input falls back to the defaults, part by part', () => {
    expect(parseA11y('not json')).toEqual(A11Y_DEFAULTS)
    expect(parseA11y('[1,2]')).toEqual(A11Y_DEFAULTS)
    expect(normalizeA11y({ size: 'big', bold: 'yes', cb: true, extra: 1 })).toEqual({ ...A11Y_DEFAULTS, cb: true })
  })

  it('an off-scale size snaps to the nearest step', () => {
    expect(normalizeA11y({ size: 120 }).size).toBe(115)
    expect(normalizeA11y({ size: 500 }).size).toBe(150)
    expect(normalizeA11y({ size: 1 }).size).toBe(100)
  })
})
