import { describe, expect, it } from 'vitest'
import { monthName, monthNameShort, monthsArray, periodLabel } from '../date'

describe('month names', () => {
  it('are at most 4 characters everywhere', () => {
    for (let m = 1; m <= 12; m++) expect(monthName(m).length).toBeLessThanOrEqual(4)
    for (const { label } of monthsArray()) expect(label.length).toBeLessThanOrEqual(4)
  })

  it('abbreviate long names with a geresh and keep short ones whole', () => {
    expect(monthName(10)).toBe('אוק׳')
    expect(monthName(2)).toBe('פבר׳')
    expect(monthName(3)).toBe('מרץ')
    expect(monthName(6)).toBe('יוני')
    expect(monthName(7)).toBe('יולי')
  })

  it('are the same in every helper', () => {
    for (let m = 1; m <= 12; m++) expect(monthNameShort(m)).toBe(monthName(m))
    expect(monthsArray()[8]).toEqual({ value: 9, label: 'ספט׳' })
    expect(periodLabel(2030, 9)).toBe('ספט׳ 2030')
  })
})
