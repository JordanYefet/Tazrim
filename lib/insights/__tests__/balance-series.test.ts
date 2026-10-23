import { describe, expect, it } from 'vitest'
import { balanceSeries } from '../balance-series'

// Made-up rows only
const row = (date: string, balance: number, debit = 0, credit = 0, ignored = false) => ({ date, balance, debit, credit, ignored })

describe('balanceSeries', () => {
  it('goes oldest first with running totals; ignored rows keep their balance but add nothing', () => {
    const rows = [row('2030-01-03', 900, 300), row('2030-01-02', 1200, 0, 50, true), row('2030-01-01', 1150, 0, 1000)]
    expect(balanceSeries(rows)).toEqual([
      { date: '2030-01-01', balance: 1150, income: 1000, expense: 0 },
      { date: '2030-01-02', balance: 1200, income: 1000, expense: 0 },
      { date: '2030-01-03', balance: 900, income: 1000, expense: 300 },
    ])
  })

  it('is empty without rows', () => {
    expect(balanceSeries([])).toEqual([])
  })
})
