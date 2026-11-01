import { describe, expect, it } from 'vitest'
import { FRESH_MS, pickOriginPoint } from '../open-origin'

const button = { left: 100, top: 40, width: 80, height: 20 }

describe('pickOriginPoint', () => {
  it('uses a fresh tap', () => {
    expect(pickOriginPoint({ x: 10, y: 20, t: 1000 }, 0, 1200, button)).toEqual({ x: 10, y: 20 })
  })

  it('ignores a stale tap and falls back to the focused element centre', () => {
    expect(pickOriginPoint({ x: 10, y: 20, t: 1000 }, 0, 1000 + FRESH_MS, button)).toEqual({ x: 140, y: 50 })
  })

  it('prefers the focused element when a key was pressed after the tap', () => {
    expect(pickOriginPoint({ x: 10, y: 20, t: 1000 }, 1100, 1200, button)).toEqual({ x: 140, y: 50 })
  })

  it('gives null (the window centre) with nothing to go on, or a hidden element', () => {
    expect(pickOriginPoint(null, 0, 5000, null)).toBeNull()
    expect(pickOriginPoint(null, 0, 5000, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})
