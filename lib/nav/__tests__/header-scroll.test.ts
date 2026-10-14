import { describe, expect, it } from 'vitest'
import { HEADER_SCROLL_INITIAL, headerScrollReducer, type HeaderScrollState } from '../header-scroll'

const opts = { threshold: 20, topZone: 50 }
const run = (ys: number[], maxY = 2000, start: HeaderScrollState = HEADER_SCROLL_INITIAL) =>
  ys.reduce((s, y) => headerScrollReducer(s, { y, maxY }, opts), start)

describe('headerScrollReducer', () => {
  it('starts visible', () => {
    expect(HEADER_SCROLL_INITIAL.hidden).toBe(false)
  })

  it('stays visible near the top', () => {
    expect(run([10, 30, 49]).hidden).toBe(false)
  })

  it('stays visible for a small move down past the top zone (counted from its edge)', () => {
    expect(run([55, 60, 65]).hidden).toBe(false)
  })

  it('hides once the downward move passes the threshold', () => {
    expect(run([60, 70, 85]).hidden).toBe(true)
  })

  it('counts the threshold from where the downward move began', () => {
    // up to 300, back to 200 (header shows), then down 15: not enough
    const s = run([100, 200, 300, 200, 215])
    expect(s.hidden).toBe(false)
    expect(run([221], 2000, s).hidden).toBe(true)
  })

  it('shows again on any move up', () => {
    const hidden = run([100, 200, 300])
    expect(hidden.hidden).toBe(true)
    expect(run([299], 2000, hidden).hidden).toBe(false)
  })

  it('shows when back in the top zone even while moving down', () => {
    const hidden = run([100, 200, 300])
    expect(run([0], 2000, hidden).hidden).toBe(false)
  })

  it('ignores overscroll past the bottom (rubber-banding)', () => {
    const hidden = run([100, 500, 1000], 1000)
    // iOS reports y beyond maxY, then springs back to maxY
    expect(run([1040, 1000], 1000, hidden).hidden).toBe(true)
  })

  it('ignores negative overscroll at the top', () => {
    expect(run([-30, -10]).hidden).toBe(false)
  })

  it('returns the same state when nothing moved', () => {
    const s = run([100, 200])
    expect(headerScrollReducer(s, { y: 200, maxY: 2000 }, opts)).toBe(s)
  })
})
