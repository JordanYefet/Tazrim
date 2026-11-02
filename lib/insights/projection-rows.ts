import { monthLabel } from './projection-format'
import type { ProjectedMonth } from './projection'

export interface ChartRow {
  label: string
  actual?: number
  /** the forecast line from the first current month on */
  expected?: number
  band?: [number, number]
  /** the same, for months already passed without data: drawn faintly */
  staleExpected?: number
  staleBand?: [number, number]
  tight?: boolean
}

/**
 * Chart rows: the actual balance, then the forecast. Stale months (passed, no data yet) go in
 * their own faint series, which joins the actual line at one end and the normal forecast at the other.
 */
export function buildChartRows(past: { month: string; balance: number }[], months: ProjectedMonth[], start: number): ChartRow[] {
  // The forecast's first row is the latest data month, standing for its month-end; the actual
  // point of that month is mid-month (the start date), so it gives way and the line joins the
  // forecast from the month before.
  const firstMonth = months[0]?.month
  const kept = firstMonth ? past.filter(p => p.month < firstMonth) : past
  const actual: ChartRow[] = kept.map(p => ({ label: monthLabel(p.month), actual: p.balance }))
  const firstFresh = months.findIndex(m => !m.stale)
  const hasStale = months.some(m => m.stale)
  const join: ChartRow | undefined = actual[actual.length - 1]
  if (join) {
    const v = kept.length === past.length ? start : join.actual!
    if (hasStale) { join.staleExpected = v; join.staleBand = [v, v] }
    else { join.expected = v; join.band = [v, v] }
  }
  const forecast: ChartRow[] = months.map((m, i) => {
    const row: ChartRow = { label: monthLabel(m.month), tight: m.tight }
    const v = m.expected
    const b: [number, number] = [m.low, m.high]
    if (m.stale) { row.staleExpected = v; row.staleBand = b }
    else { row.expected = v; row.band = b }
    // the faint run reaches the first current month, so the two lines meet
    if (i === firstFresh && hasStale) { row.staleExpected = v; row.staleBand = b }
    return row
  })
  return [...actual, ...forecast]
}
