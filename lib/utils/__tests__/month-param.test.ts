import { describe, expect, it } from 'vitest'
import { toggleMonthQuery } from '../month-param'

describe('toggleMonthQuery', () => {
  it('selects a month, keeping the other params', () => {
    expect(toggleMonthQuery('year=2030&card=x', 6)).toBe('year=2030&card=x&month=6')
  })

  it('switches to another month', () => {
    expect(toggleMonthQuery('year=2030&month=6', 7)).toBe('year=2030&month=7')
  })

  it('clicking the selected month again goes back to all months', () => {
    expect(toggleMonthQuery('year=2030&month=6', 6)).toBe('year=2030')
    expect(toggleMonthQuery('month=6', 6)).toBe('')
  })
})
