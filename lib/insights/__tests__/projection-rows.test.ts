import { describe, expect, it } from 'vitest'
import { buildChartRows } from '../projection-rows'
import type { ProjectedMonth } from '../projection'

const m = (month: string, expected: number, stale: boolean): ProjectedMonth => ({
  month, income: 0, expense: 0, net: 0, expected, low: expected - 100, high: expected + 100, stale, tight: false,
})

describe('chart rows', () => {
  const past = [{ month: '2030-10', balance: 900 }]
  const months = [m('2030-11', 1000, true), m('2030-12', 1100, true), m('2031-01', 1200, false), m('2031-02', 1300, false)]
  const rows = buildChartRows(past, months, 950)

  it('puts stale months in the faint series only', () => {
    expect(rows[1].staleExpected).toBe(1000)
    expect(rows[1].expected).toBeUndefined()
    expect(rows[2].staleBand).toEqual([1000, 1200])
  })

  it('joins the faint run to the actual line and to the first current month', () => {
    expect(rows[0].staleExpected).toBe(950)
    expect(rows[3].staleExpected).toBe(1200)
    expect(rows[3].expected).toBe(1200)
    expect(rows[4].staleExpected).toBeUndefined()
  })

  it('draws everything normally when nothing is stale', () => {
    const r = buildChartRows(past, [m('2030-11', 1000, false)], 950)
    expect(r[0].expected).toBe(950)
    expect(r.every(x => x.staleExpected === undefined)).toBe(true)
  })
})
