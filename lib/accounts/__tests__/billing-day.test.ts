import { describe, expect, it } from 'vitest'
import { billingDay } from '../billing-day'

const on = (y: number, m: number, d: number, count = 10) => ({ date: new Date(y, m - 1, d), count })

describe('billingDay', () => {
  it('is the day every statement is charged on', () => {
    expect(billingDay([on(2026, 9, 2), on(2026, 10, 2), on(2026, 11, 2)])).toBe(2)
  })

  it('takes each month by its main day, not the odd immediate charge', () => {
    expect(billingDay([on(2026, 10, 10, 40), on(2026, 10, 3, 2), on(2026, 11, 10, 35), on(2026, 11, 21, 1)])).toBe(10)
  })

  it('is not moved by one month a holiday or a weekend shifted', () => {
    expect(billingDay([on(2026, 7, 2), on(2026, 8, 4), on(2026, 9, 2), on(2026, 10, 2), on(2026, 11, 3)])).toBe(2)
  })

  it('follows an issuer that moved the day, within the last statements', () => {
    const old = [1, 2, 3, 4, 5, 6].map(m => on(2026, m, 2))
    const moved = [7, 8, 9, 10, 11].map(m => on(2026, m, 10))
    expect(billingDay([...old, ...moved])).toBe(10)
  })

  it('gives a tie to the latest month', () => {
    expect(billingDay([on(2026, 10, 2), on(2026, 11, 15)])).toBe(15)
  })

  it('is null without rows', () => {
    expect(billingDay([])).toBeNull()
  })
})
