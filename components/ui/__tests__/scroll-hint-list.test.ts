import { describe, expect, it } from 'vitest'
import { hintOffset } from '../scroll-hint-list'

describe('hintOffset', () => {
  it('starts and ends at the top, and is furthest down half way', () => {
    expect(hintOffset(0, 44)).toBe(0)
    expect(hintOffset(0.5, 44)).toBe(44)
    expect(hintOffset(1, 44)).toBe(0)
  })

  it('goes down and comes back the same way', () => {
    expect(hintOffset(0.25, 40)).toBe(hintOffset(0.75, 40))
    expect(hintOffset(0.25, 40)).toBeGreaterThan(0)
    expect(hintOffset(0.25, 40)).toBeLessThan(40)
  })
})
