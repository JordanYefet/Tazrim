import { describe, expect, it } from 'vitest'
import { A11Y_DEFAULTS, a11yClasses, formatA11y, normalizeA11y, parseA11y } from '../settings'

describe('accessibility settings', () => {
  it('defaults: nothing on, no classes', () => {
    expect(parseA11y(undefined)).toEqual(A11Y_DEFAULTS)
    expect(a11yClasses(A11Y_DEFAULTS)).toBe('')
  })

  it('maps every option to its class', () => {
    const all = { size: 150, font: true, bold: true, spacing: true, contrast: true, cb: true, still: true, focus: true, underline: true } as const
    expect(a11yClasses(all).split(' ').sort()).toEqual(
      ['a11y-text-150', 'a11y-font', 'a11y-bold', 'a11y-spacing', 'a11y-contrast', 'a11y-cb', 'a11y-still', 'a11y-focus', 'a11y-underline'].sort()
    )
    expect(a11yClasses({ ...A11Y_DEFAULTS, size: 115 })).toBe('a11y-text-115')
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
