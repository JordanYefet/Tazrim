import { describe, it, expect } from 'vitest'
import {
  MAGNIFICATION,
  bevelProfile,
  refract,
  resolveRadius,
  roundedRectDistance,
  slabDisplacement,
  slabParams,
  textureRegion,
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
    // The square corner point is outside a rounded corner by r(√2 − 1)
    expect(roundedRectDistance(100, 50, 100, 50, 10)).toBeCloseTo(10 * (Math.SQRT2 - 1))
  })
})

describe('bevelProfile', () => {
  const p = slabParams(358, 226, 23)
  it('is flat and full height past the bevel', () => {
    expect(bevelProfile(p.bevel + 5, p)).toEqual({ height: p.thickness, slope: 0 })
  })
  it('falls toward the edge, steeper the closer it gets', () => {
    const mid = bevelProfile(p.bevel / 2, p)
    const near = bevelProfile(1, p)
    expect(mid.height).toBeLessThan(p.thickness)
    expect(near.height).toBeLessThan(mid.height)
    expect(near.slope).toBeGreaterThan(mid.slope)
    expect(Number.isFinite(bevelProfile(0, p).slope)).toBe(true)
  })
})

describe('slabParams', () => {
  it('grows with the element, within limits', () => {
    const small = slabParams(44, 28, 5)
    const card = slabParams(358, 226, 23)
    const huge = slabParams(2000, 1200, 40)
    expect(card.bevel).toBeGreaterThan(small.bevel)
    expect(huge.bevel).toBeLessThanOrEqual(28)
    expect(huge.thickness).toBeLessThanOrEqual(24)
    expect(small.radius).toBeLessThanOrEqual(14)
  })
})

describe('refract', () => {
  it('passes straight through a flat face', () => {
    const t = refract([0, 0, -1], [0, 0, 1], 1 / 1.45)!
    expect(t[0]).toBeCloseTo(0)
    expect(t[2]).toBeCloseTo(-1)
  })
  it('returns null on total internal reflection', () => {
    const s = Math.SQRT1_2
    expect(refract([s, 0, -s], [0, 0, 1], 1.45)).toBeNull()
  })
})

describe('slabDisplacement', () => {
  const p = slabParams(358, 226, 23)
  const ior = 1.45

  it('sees straight through the middle', () => {
    const [dx, dy] = slabDisplacement(200, [1, 0], [0, 0], p, ior)
    expect(Math.abs(dx)).toBeLessThan(0.01)
    expect(Math.abs(dy)).toBeLessThan(0.01)
  })

  it('magnifies the flat middle slightly: off centre it looks a few % toward the centre', () => {
    const x = 120
    const [dx] = slabDisplacement(p.bevel + 20, [1, 0], [x, 0], p, ior)
    expect(dx).toBeLessThan(0)
    expect(-dx / x).toBeGreaterThan(MAGNIFICATION * 0.6)
    expect(-dx / x).toBeLessThan(MAGNIFICATION * 1.6)
  })

  it('bends strongly on the bevel, toward the middle', () => {
    const [flat] = slabDisplacement(p.bevel + 1, [1, 0], [0, 0], p, ior)
    const [rim] = slabDisplacement(p.bevel * 0.25, [1, 0], [0, 0], p, ior)
    expect(rim).toBeLessThan(-4)
    expect(Math.abs(rim)).toBeGreaterThan(Math.abs(flat) * 10)
  })

  it('bends blue more than red (dispersion)', () => {
    const [red] = slabDisplacement(p.bevel * 0.4, [0, 1], [0, 0], p, ior - 0.035)
    const [, redY] = slabDisplacement(p.bevel * 0.4, [0, 1], [0, 0], p, ior - 0.035)
    const [, blueY] = slabDisplacement(p.bevel * 0.4, [0, 1], [0, 0], p, ior + 0.035)
    expect(red).toBeCloseTo(0)
    expect(Math.abs(blueY)).toBeGreaterThan(Math.abs(redY))
  })
})

describe('textureRegion', () => {
  it('covers the viewport plus a margin', () => {
    const r = textureRegion(390, 844, 3, 8192)
    expect(r.x).toBeLessThan(0)
    expect(r.y).toBeLessThan(0)
    expect(r.width).toBe(390 - 2 * r.x)
    expect(r.height).toBe(844 - 2 * r.y)
  })
  it('uses up to 1.5 texels per px, at least 1', () => {
    expect(textureRegion(390, 844, 3, 8192).scale).toBe(1.5)
    expect(textureRegion(1440, 900, 1, 8192).scale).toBe(1)
  })
  it('shrinks to fit the GPU limit', () => {
    const r = textureRegion(3000, 1800, 2, 2048)
    expect(r.width * r.scale).toBeLessThanOrEqual(2048)
  })
})
