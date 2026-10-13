import { describe, expect, it } from 'vitest'
import {
  bankPeriodTotals,
  cardPeriodTotals,
  emptyBankMonthly,
  emptyCardMonthly,
  lastMonthWithData,
  plottedMonthCount,
  shareOf,
  sumBankMonthly,
  sumCardMonthly,
} from '../account-overview'

// Made-up values only
function bank(entries: Record<number, [number, number]>) {
  const m = emptyBankMonthly()
  for (const [k, [income, expense]] of Object.entries(entries)) m[Number(k)] = { income, expense }
  return m
}

function card(entries: Record<number, number>) {
  return { ...emptyCardMonthly(), ...entries }
}

describe('sumBankMonthly', () => {
  it('adds bank accounts month by month', () => {
    const a = bank({ 1: [1000, 400], 2: [0, 50] })
    const b = bank({ 1: [10, 20], 3: [5, 0] })
    const sum = sumBankMonthly([a, b])
    expect(sum[1]).toEqual({ income: 1010, expense: 420 })
    expect(sum[2]).toEqual({ income: 0, expense: 50 })
    expect(sum[3]).toEqual({ income: 5, expense: 0 })
    expect(sum[12]).toEqual({ income: 0, expense: 0 })
  })

  it('accepts string month keys (JSON round trip)', () => {
    const json = JSON.parse(JSON.stringify(bank({ 4: [7, 3] })))
    expect(sumBankMonthly([json])[4]).toEqual({ income: 7, expense: 3 })
  })

  it('gives twelve empty months for no accounts', () => {
    expect(sumBankMonthly([])).toEqual(emptyBankMonthly())
  })
})

describe('sumCardMonthly', () => {
  it('adds cards month by month', () => {
    const sum = sumCardMonthly([card({ 1: 100, 2: 30 }), card({ 2: 5 })])
    expect(sum[1]).toBe(100)
    expect(sum[2]).toBe(35)
    expect(sum[6]).toBe(0)
  })
})

describe('bankPeriodTotals', () => {
  const m = bank({ 1: [1000, 600], 2: [500, 900], 3: [0, 0] })

  it('totals the whole year and averages expense over months that have any', () => {
    expect(bankPeriodTotals(m)).toEqual({ income: 1500, expense: 1500, net: 0, averageExpense: 750 })
  })

  it('uses only the selected month, without an average', () => {
    expect(bankPeriodTotals(m, 2)).toEqual({ income: 500, expense: 900, net: -400, averageExpense: undefined })
  })

  it('handles a month with no data', () => {
    expect(bankPeriodTotals(m, 3)).toEqual({ income: 0, expense: 0, net: 0, averageExpense: undefined })
  })

  it('does not divide by zero for an empty year', () => {
    expect(bankPeriodTotals(emptyBankMonthly()).averageExpense).toBe(0)
  })
})

describe('cardPeriodTotals', () => {
  const m = card({ 1: 300, 2: 100 })

  it('totals the year and averages over months with charges', () => {
    expect(cardPeriodTotals(m)).toEqual({ total: 400, average: 200 })
  })

  it('uses only the selected month', () => {
    expect(cardPeriodTotals(m, 1)).toEqual({ total: 300, average: undefined })
  })
})

describe('shareOf', () => {
  it('is a 0-1 fraction and 0 when the whole is 0', () => {
    expect(shareOf(25, 100)).toBe(0.25)
    expect(shareOf(5, 0)).toBe(0)
  })
})

describe('lastMonthWithData', () => {
  it('finds the latest month with bank or card values', () => {
    expect(lastMonthWithData(bank({ 2: [1, 0], 5: [0, 1] }))).toBe(5)
    expect(lastMonthWithData(card({ 7: 10 }))).toBe(7)
    expect(lastMonthWithData(emptyCardMonthly())).toBe(0)
  })
})

describe('plottedMonthCount', () => {
  const now = new Date(2026, 3, 15) // April 2026

  it('plots all 12 months of a past year', () => {
    expect(plottedMonthCount(2025, 2, now)).toBe(12)
  })

  it('stops at the current month this year, unless data goes further', () => {
    expect(plottedMonthCount(2026, 2, now)).toBe(4)
    expect(plottedMonthCount(2026, 6, now)).toBe(6)
  })

  it('plots up to the last data month in a future year', () => {
    expect(plottedMonthCount(2027, 0, now)).toBe(1)
    expect(plottedMonthCount(2027, 3, now)).toBe(3)
  })
})
