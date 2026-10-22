import { describe, it, expect } from 'vitest'
import {
  FROST_BLUR,
  REGION_SLACK,
  RIM_BEND,
  RIM_BEVEL,
  covers,
  frostMargin,
  gaussianWeights,
  neededRegion,
  paintRegion,
  paintScale,
  resolveRadius,
  rimBend,
  rimSample,
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

describe('frost regions', () => {
  const card = { x: 16, y: 120, width: 358, height: 226 }

  it('the blur sees three standard deviations past the element', () => {
    expect(frostMargin(16)).toBe(48)
    const n = neededRegion(card)
    expect(n.x).toBe(card.x - frostMargin(FROST_BLUR))
    expect(n.width).toBe(card.width + 2 * frostMargin(FROST_BLUR))
  })

  it('paints a region with slack that covers what is needed', () => {
    const r = paintRegion(card)
    expect(covers(r, neededRegion(card))).toBe(true)
    expect(r.height - neededRegion(card).height).toBe(2 * REGION_SLACK.y)
  })

  it('reuses the painted region for a small scroll, repaints for a large one', () => {
    const r = paintRegion(card)
    expect(covers(r, neededRegion({ ...card, y: card.y - REGION_SLACK.y + 1 }))).toBe(true)
    expect(covers(r, neededRegion({ ...card, y: card.y - REGION_SLACK.y - 1 }))).toBe(false)
    expect(covers(r, neededRegion({ ...card, x: card.x + REGION_SLACK.x + 1 }))).toBe(false)
  })

  it('paints at the device pixel ratio, up to 3 (an iPhone is not half-res)', () => {
    const r = paintRegion(card)
    expect(paintScale(r, 3, 8192)).toBe(3)
    expect(paintScale(r, 2, 8192)).toBe(2)
    expect(paintScale(r, 4, 8192)).toBe(3)
    expect(paintScale(r, 0.5, 8192)).toBe(1)
  })

  it('shrinks only to fit the GPU limit', () => {
    const r = { x: 0, y: 0, width: 1500, height: 800 }
    expect(r.width * paintScale(r, 3, 2048)).toBeLessThanOrEqual(2048)
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
    expect(gaussianWeights(0.1).length).toBeGreaterThanOrEqual(2)
  })
})

describe('the thin rim', () => {
  it('bends the frost only within the bevel, most at the edge', () => {
    expect(rimBend(0)).toBeCloseTo(RIM_BEND)
    expect(rimBend(RIM_BEVEL / 2)).toBeLessThan(RIM_BEND)
    expect(rimBend(RIM_BEVEL)).toBe(0)
    expect(rimBend(40)).toBe(0)
  })
  it('the bevel is thin: a few px, not a wide band', () => {
    expect(RIM_BEVEL).toBeGreaterThanOrEqual(3)
    expect(RIM_BEVEL).toBeLessThanOrEqual(6)
  })
  it('samples inside the element, never the page beyond it', () => {
    const size = { width: 300, height: 200 }
    // At the left edge, bending inward (right)
    expect(rimSample({ x: 0, y: 100 }, { x: 1, y: 0 }, 0, size).x).toBeGreaterThanOrEqual(1)
    // Even a wrong direction stays clamped inside
    const s = rimSample({ x: 299.5, y: 199.5 }, { x: 1, y: 1 }, 0, size)
    expect(s.x).toBeLessThanOrEqual(299)
    expect(s.y).toBeLessThanOrEqual(199)
  })
  it('leaves the middle alone', () => {
    expect(rimSample({ x: 150, y: 100 }, { x: 1, y: 0 }, 100, { width: 300, height: 200 })).toEqual({ x: 150, y: 100 })
  })
})
