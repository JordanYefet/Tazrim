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
  /** a forecast row's month (YYYY-MM): the chart picks it for the category donut */
  month?: string
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
    const row: ChartRow = { label: monthLabel(m.month), tight: m.tight, month: m.month }
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

/**
 * The y-axis: the data (actual line and band) with a little room, not from 0, so a month's
 * season shows as a change of slope, on round ticks. The cushion is kept in view when it is set.
 */
export function chartDomain(rows: ChartRow[], cushion: number): { domain: [number, number]; ticks: number[] } {
  const values = rows.flatMap(r => [r.actual, ...(r.band ?? []), ...(r.staleBand ?? [])]).filter((v): v is number => v !== undefined)
  if (cushion > 0) values.push(cushion)
  if (values.length === 0) return { domain: [0, 1], ticks: [0, 1] }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  // A round step for about four intervals: 1, 2, 2.5 or 5 times a power of ten
  const raw = Math.max((hi - lo) / 4, 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find(m => m * power >= raw) ?? 10) * power
  const start = Math.floor(lo / step) * step
  const stop = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let t = start; t <= stop + step / 2; t += step) ticks.push(Math.round(t))
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks }
}

export interface CategoryRow {
  label: string
  /** YYYY-MM */
  month: string
  /** category → expected spending that month (0 when it has none) */
  values: Record<string, number>
}

/**
 * The category lines: one row per forecast month with every category's expected spending, and
 * the categories ranked by their highest month (ties by their total), so the default picks
 * show the peaks.
 */
export function categorySeries(months: ProjectedMonth[]): { names: string[]; rows: CategoryRow[] } {
  const peak = new Map<string, number>()
  const total = new Map<string, number>()
  for (const m of months)
    for (const c of m.categories ?? []) {
      peak.set(c.name, Math.max(peak.get(c.name) ?? 0, c.monthlyAmount))
      total.set(c.name, (total.get(c.name) ?? 0) + c.monthlyAmount)
    }
  const names = [...peak.keys()].sort((a, b) => peak.get(b)! - peak.get(a)! || total.get(b)! - total.get(a)!)
  const rows = months.map(m => {
    const values: Record<string, number> = {}
    for (const name of names) values[name] = 0
    for (const c of m.categories ?? []) values[c.name] = c.monthlyAmount
    return { label: monthLabel(m.month), month: m.month, values }
  })
  return { names, rows }
}
