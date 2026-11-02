import { describe, expect, it } from 'vitest'
import { buildChartRows } from '../projection-rows'
import { monthLabel } from '../projection-format'
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

  it('the partial first month stands for its own month-end: the mid-month actual point gives way, and the actual line joins the faint run', () => {
    // data ends mid-July: past has July's latest balance, and the forecast starts with what is left of July
    const pastToJuly = [{ month: '2030-06', balance: 800 }, { month: '2030-07', balance: 950 }]
    const r = buildChartRows(pastToJuly, [m('2030-07', 1000, true), m('2030-08', 1100, false)], 950)
    expect(r.map(x => x.label)).toEqual(['2030-06', '2030-07', '2030-08'].map(monthLabel))
    expect(r[0]).toMatchObject({ actual: 800, staleExpected: 800 })
    expect(r[1]).toMatchObject({ staleExpected: 1000 })
    expect(r[1].actual).toBeUndefined()
    expect(r[2]).toMatchObject({ staleExpected: 1100, expected: 1100 })
  })
})
