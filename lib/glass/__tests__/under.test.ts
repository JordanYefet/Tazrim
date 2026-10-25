import { describe, it, expect } from 'vitest'
import { cssGradientLine, overlaps, parseCanvasColor, underSignature, type UnderFace } from '../under'
import { cacheKey } from '../geometry'

const box = { x: 10, y: 20, width: 200, height: 100 }

describe('cssGradientLine', () => {
  it('runs top to bottom through the centre at 180deg', () => {
    const l = cssGradientLine(180, box)
    expect(l.x0).toBeCloseTo(110)
    expect(l.x1).toBeCloseTo(110)
    expect(l.y0).toBeCloseTo(20)
    expect(l.y1).toBeCloseTo(120)
  })
  it('runs left to right at 90deg', () => {
    const l = cssGradientLine(90, box)
    expect(l.x0).toBeCloseTo(10)
    expect(l.x1).toBeCloseTo(210)
    expect(l.y0).toBeCloseTo(70)
  })
  it('is long enough to reach the corners at an angle', () => {
    const l = cssGradientLine(158, box)
    const length = Math.hypot(l.x1 - l.x0, l.y1 - l.y0)
    const a = (158 * Math.PI) / 180
    expect(length).toBeCloseTo(Math.abs(200 * Math.sin(a)) + Math.abs(100 * Math.cos(a)))
  })
})

describe('underSignature', () => {
  const face: UnderFace = { rect: { x: 30, y: 10, width: 180, height: 110 }, radius: 12, colors: ['#111111', '#222222', '#333333'] }
  it('is empty without faces', () => {
    expect(underSignature(undefined, box)).toBe('')
    expect(underSignature([], box)).toBe('')
  })
  it('stays the same when the element and the faces move together', () => {
    const moved = { ...face, rect: { ...face.rect, x: face.rect.x + 50, y: face.rect.y + 7 } }
    expect(underSignature([moved], { ...box, x: box.x + 50, y: box.y + 7 })).toBe(underSignature([face], box))
  })
  it('changes with a face\'s colours or its place under the element', () => {
    const sig = underSignature([face], box)
    expect(underSignature([{ ...face, colors: ['#111111', '#222222', '#444444'] }], box)).not.toBe(sig)
    expect(underSignature([{ ...face, rect: { ...face.rect, y: face.rect.y + 5 } }], box)).not.toBe(sig)
  })
})

describe('cacheKey with faces under', () => {
  const parts = { id: 'acct_x', width: 300, height: 190, rect: box, scale: 1, dpr: 2, theme: 'light', background: 'lines.a.1' }
  it('keeps the key as it was without faces, and puts them before the place', () => {
    expect(cacheKey(parts)).toBe(cacheKey({ ...parts, under: '' }))
    const withUnder = cacheKey({ ...parts, under: 'sig' })
    expect(withUnder).not.toBe(cacheKey(parts))
    expect(withUnder.split('@')[0]).toContain('sig')
  })
})

describe('overlaps', () => {
  it('is true when two rects share any area, false when they only touch or are apart', () => {
    expect(overlaps(box, { x: 200, y: 100, width: 50, height: 50 })).toBe(true)
    expect(overlaps(box, { x: 210, y: 20, width: 50, height: 50 })).toBe(false)
    expect(overlaps(box, { x: 400, y: 400, width: 5, height: 5 })).toBe(false)
  })
})

describe('parseCanvasColor', () => {
  it('reads the colours a canvas normalises to', () => {
    expect(parseCanvasColor('#1a2b3c')).toEqual([26, 43, 60])
    expect(parseCanvasColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30])
  })
})
