import { describe, expect, it } from 'vitest'
import { periodLabel } from '../date'

describe('periodLabel', () => {
  it('names the month and year', () => {
    expect(periodLabel('2025', 3)).toBe('מרץ 2025')
  })

  it('names the whole year when no month is selected', () => {
    expect(periodLabel('2025')).toBe('כל החודשים · 2025')
  })
})
