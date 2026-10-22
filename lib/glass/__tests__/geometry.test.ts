import { describe, it, expect } from 'vitest'
import {
  FROST_BLUR,
  cacheKey,
  nearSameRect,
  bakeMargin,
  bakeRegion,
  bakeScale,
  edgeFactor,
  fresnelSchlick,
  gaussianWeights,
  lensOffset,
  lensParams,
  resolveRadius,
  roundedRectDistance,
} from '../geometry'

describe('resolveRadius', () => {
  it('reads px', () => {
    expect(resolveRadius('18px', 358, 176)).toBe(18)
    expect(resolveRadius('22.9px 22.9px', 358, 226)).toBeCloseTo(22.9)
  })
  it('resolves the card corner (6.4% / 10.15%) to one round radius', () => {
    const w = 358
    const h = (w * 54) / 85.6
    expect(resolveRadius('6.4% 10.15%', w, h)).toBeCloseTo(0.064 * w, 0)
  })
  it('uses the smaller axis of an elliptical corner and caps at half the side', () => {
    expect(resolveRadius('30px 10px', 100, 100)).toBe(10)
    expect(resolveRadius('999px', 100, 40)).toBe(20)
  })
  it('is 0 for nothing', () => {
    expect(resolveRadius('', 10, 10)).toBe(0)
    expect(resolveRadius(undefined, 10, 10)).toBe(0)
    expect(resolveRadius('auto', 10, 10)).toBe(0)
  })
})

describe('roundedRectDistance', () => {
  it('is negative inside, 0 on the edge, positive outside', () => {
    expect(roundedRectDistance(0, 0, 100, 50, 10)).toBe(-50)
    expect(roundedRectDistance(100, 0, 100, 50, 10)).toBeCloseTo(0)
    expect(roundedRectDistance(110, 0, 100, 50, 10)).toBeCloseTo(10)
  })
  it('rounds the corners', () => {
    expect(roundedRectDistance(100, 50, 100, 50, 10)).toBeCloseTo(10 * (Math.SQRT2 - 1))
  })
})

describe('the lens', () => {
  const card = lensParams(358, 226)

  it('is a narrow band along the edge', () => {
    expect(card.band).toBeGreaterThanOrEqual(10)
    expect(card.band).toBeLessThanOrEqual(24)
    expect(lensParams(40, 26).band).toBeGreaterThanOrEqual(8)
  })
  it('bends most at the edge and not at all past the band', () => {
    expect(edgeFactor(0, card.band)).toBe(1)
    expect(edgeFactor(card.band, card.band)).toBe(0)
    expect(edgeFactor(card.band * 2, card.band)).toBe(0)
    expect(lensOffset(0, card)).toBeCloseTo(card.reach)
    expect(lensOffset(card.band / 2, card)).toBeLessThan(card.reach / 2)
    expect(card.reach).toBeGreaterThan(card.band)
    expect(lensOffset(card.band + 1, card)).toBe(0)
  })
  it('eases smoothly (no step at the band)', () => {
    const near = edgeFactor(card.band * 0.98, card.band)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(0.01)
  })
})

describe('the bake region', () => {
  const p = lensParams(358, 226)
  it('covers the lens reach and the frost', () => {
    const m = bakeMargin(p)
    expect(m).toBeGreaterThanOrEqual(p.reach + 3 * FROST_BLUR)
    const r = bakeRegion({ x: 16, y: 300, width: 358, height: 226 }, m)
    expect(r).toEqual({ x: 16 - m, y: 300 - m, width: 358 + 2 * m, height: 226 + 2 * m })
  })
  it('bakes at the device pixel ratio, up to 3', () => {
    const r = { x: 0, y: 0, width: 450, height: 320 }
    expect(bakeScale(r, 3, 8192)).toBe(3)
    expect(bakeScale(r, 2, 8192)).toBe(2)
    expect(bakeScale(r, 4, 8192)).toBe(3)
    expect(bakeScale(r, 0.5, 8192)).toBe(1)
  })
  it('shrinks only to fit the GPU limit', () => {
    const r = { x: 0, y: 0, width: 1500, height: 800 }
    expect(r.width * bakeScale(r, 3, 2048)).toBeLessThanOrEqual(2048)
  })
})

describe('cacheKey', () => {
  const base = { id: 'card-a', width: 358, height: 226, rect: { x: 16, y: 300, width: 358, height: 226 }, scale: 1, dpr: 3, theme: 'light', background: 'lines.indigo-pink.10' }
  it('is stable for the same element in the same place', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base, rect: { ...base.rect, x: 16.1 } }))
  })
  it('changes when the element, its place, size, scale, theme or background changes', () => {
    for (const other of [
      { ...base, id: 'card-b' },
      { ...base, rect: { ...base.rect, y: 320 } },
      { ...base, width: 300 },
      { ...base, scale: 0.93 },
      { ...base, theme: 'dark' },
      { ...base, background: 'ribbons.indigo-pink.10' },
      { ...base, dpr: 2 },
    ]) expect(cacheKey(other)).not.toBe(cacheKey(base))
  })
  it('keeps the place after "@", so a moved element is the same glass elsewhere', () => {
    const a = cacheKey(base).split('@')
    const b = cacheKey({ ...base, rect: { ...base.rect, y: 900 } }).split('@')
    expect(a[0]).toBe(b[0])
    expect(a[1]).not.toBe(b[1])
  })
})

describe('nearSameRect', () => {
  const r = { x: 10, y: 20, width: 100, height: 60 }
  it('accepts a settle within the tolerance and rejects more', () => {
    expect(nearSameRect(r, { ...r, y: 21.5 }, 2)).toBe(true)
    expect(nearSameRect(r, { ...r, y: 23 }, 2)).toBe(false)
    expect(nearSameRect(r, { ...r, width: 97 }, 2)).toBe(false)
  })
})

describe('gaussianWeights', () => {
  it('sums to 1 over both sides and falls off from the centre', () => {
    const w = gaussianWeights(4)
    const total = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 6)
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1])
  })
  it('reaches three standard deviations', () => {
    expect(gaussianWeights(4)).toHaveLength(13)
  })
})

describe('fresnelSchlick', () => {
  it('is F0 head-on and rises to 1 at grazing angles', () => {
    expect(fresnelSchlick(1)).toBeCloseTo(0.04)
    expect(fresnelSchlick(0)).toBeCloseTo(1)
    expect(fresnelSchlick(0.5)).toBeGreaterThan(0.04)
    expect(fresnelSchlick(0.5)).toBeLessThan(fresnelSchlick(0.2))
  })
})
