import { describe, expect, it } from 'vitest'
import { clickedMonth, isEmptyMonthPayload } from '../month-slots'

describe('clickedMonth', () => {
  it('reads the month from the clicked row', () => {
    expect(clickedMonth({ activePayload: [{ payload: { month: 4 } }], activeTooltipIndex: 3 })).toBe(4)
  })

  it('falls back to the hovered index on an empty month (no bar, no payload)', () => {
    expect(clickedMonth({ activePayload: [], activeTooltipIndex: 11 })).toBe(12)
  })

  it('is undefined outside the plot', () => {
    expect(clickedMonth(null)).toBeUndefined()
    expect(clickedMonth({ activeTooltipIndex: -1 })).toBeUndefined()
  })
})

describe('isEmptyMonthPayload', () => {
  it('is true only over an empty month', () => {
    expect(isEmptyMonthPayload([{ payload: { empty: true } }])).toBe(true)
    expect(isEmptyMonthPayload([{ payload: { empty: false } }])).toBe(false)
    expect(isEmptyMonthPayload(undefined)).toBe(false)
  })
})
