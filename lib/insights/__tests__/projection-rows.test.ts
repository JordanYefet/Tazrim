import { describe, expect, it } from 'vitest'
import { buildChartRows, categorySeries, chartDomain } from '../projection-rows'
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

describe('chartDomain', () => {
  it('fits the data on round ticks instead of starting at 0', () => {
    const rows = [{ label: 'a', actual: 100000 }, { label: 'b', band: [104000, 108000] as [number, number] }]
    const { domain, ticks } = chartDomain(rows, 0)
    expect(ticks).toEqual([100000, 102000, 104000, 106000, 108000])
    expect(domain).toEqual([100000, 108000])
  })

  it('keeps a set cushion in view', () => {
    const rows = [{ label: 'a', actual: 100000 }]
    expect(chartDomain(rows, 60000).domain[0]).toBeLessThanOrEqual(60000)
  })
})

describe('categorySeries', () => {
  const pm = (month: string, categories: { name: string; monthlyAmount: number }[]): ProjectedMonth => ({
    month, income: 0, expense: 0, net: 0, expected: 0, low: 0, high: 0, stale: false, tight: false, categories,
  })

  it('draws the past months as actual, then the forecast, meeting at the last actual month', () => {
    const { rows } = categorySeries(
      [
        { month: '2030-06', categories: [{ name: 'דיור', monthlyAmount: 5000 }] },
        { month: '2030-07', categories: [{ name: 'דיור', monthlyAmount: 5000 }] },
      ],
      [pm('2030-07', [{ name: 'מזון', monthlyAmount: 800 }]), pm('2030-08', [{ name: 'דיור', monthlyAmount: 5000 }, { name: 'מזון', monthlyAmount: 2000 }])]
    )
    expect(rows.map(r => [r.month, r.forecast])).toEqual([['2030-06', false], ['2030-07', true], ['2030-08', true]])
    expect(rows[0].actual).toEqual({ דיור: 5000, מזון: 0 })
    expect(rows[0].expected).toEqual(rows[0].actual)
    // the latest data month: what is already in, plus what is left
    expect(rows[1].expected).toEqual({ דיור: 5000, מזון: 800 })
    expect(rows[2].expected).toEqual({ דיור: 5000, מזון: 2000 })
  })

  it('ranks categories by their highest forecast month, so a once-a-year peak ranks high', () => {
    const { names } = categorySeries([], [
      pm('2030-08', [{ name: 'מזון', monthlyAmount: 2500 }]),
      pm('2030-09', [{ name: 'מזון', monthlyAmount: 2600 }, { name: 'תיירות', monthlyAmount: 4000 }]),
    ])
    expect(names).toEqual(['תיירות', 'מזון'])
  })
})
