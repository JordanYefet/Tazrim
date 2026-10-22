import { describe, expect, it } from 'vitest'
import { yearChartRows } from '../chart-months'
import {
  bankPeriodTotals,
  cardPeriodTotals,
  emptyBankMonthly,
  emptyCardMonthly,
  monthlyAverage,
  type BankMonthly,
  type CardMonthly,
} from '../account-overview'
import { monthName } from '@/lib/utils/date'

// Made-up values only: data for January to March, nothing after
const card: CardMonthly = { ...emptyCardMonthly(), 1: 300, 2: 600, 3: 900 }
const bank: BankMonthly = { ...emptyBankMonthly(), 1: { income: 1000, expense: 200 }, 2: { income: 1000, expense: 400 }, 3: { income: 0, expense: 600 } }

describe('yearChartRows', () => {
  it('always has January to December, in order', () => {
    const rows = yearChartRows(['total'], m => card[m])
    expect(rows.map(r => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(rows[11].name).toBe(monthName(12))
  })

  it('keeps the values of months with data', () => {
    const rows = yearChartRows(['total'], m => card[m])
    expect(rows[1]).toMatchObject({ month: 2, empty: false, total: 600 })
  })

  it('marks months without data empty with null values (no bar), not 0', () => {
    const rows = yearChartRows(['total'], m => card[m])
    expect(rows[11]).toMatchObject({ month: 12, empty: true, total: null })
    expect(rows.filter(r => r.empty)).toHaveLength(9)
  })

  it('a month is empty only when every series is 0', () => {
    const rows = yearChartRows(['income', 'expense'] as const, (m, k) => bank[m][k])
    // March has an expense but no income: a real ₪0 income next to a bar
    expect(rows[2]).toMatchObject({ empty: false, income: 0, expense: 600 })
    expect(rows[3]).toMatchObject({ empty: true, income: null, expense: null })
  })

  it('treats missing values as 0', () => {
    const rows = yearChartRows(['a'], () => undefined)
    expect(rows.every(r => r.empty && r.a === null)).toBe(true)
  })
})

// The chart shows 12 months, but averages still divide by the months with data
describe('averages over a partial year (ENG-70)', () => {
  it('monthlyAverage divides by the 3 months with data, not 12', () => {
    expect(monthlyAverage(card)).toBe(600)
  })

  it('cardPeriodTotals average ignores the empty months, also with an empty month selected', () => {
    expect(cardPeriodTotals(card).average).toBe(600)
    expect(cardPeriodTotals(card, 12)).toEqual({ total: 0, average: 600 })
  })

  it('bankPeriodTotals averageExpense ignores the empty months, also with an empty month selected', () => {
    expect(bankPeriodTotals(bank).averageExpense).toBe(400)
    expect(bankPeriodTotals(bank, 12)).toEqual({ income: 0, expense: 0, net: 0, averageExpense: 400 })
  })
})
