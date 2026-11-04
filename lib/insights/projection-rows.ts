import { monthLabel } from './projection-format'
import type { ProjectedMonth, ProjectionCategory } from './projection'

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
  /** a forecast month (pickable on the chart); past months are actual */
  forecast: boolean
  /** category → actual spending that month (past months; the last of them also starts the forecast) */
  actual?: Record<string, number>
  /** category → expected spending that month */
  expected?: Record<string, number>
}

/**
 * The category lines, over the same months as the balance chart: what each category actually
 * cost in the past months, then the forecast. The latest data month counts what is already in
 * plus what is left of it. The last actual month also starts the forecast, so the two lines meet.
 * Categories are ranked by their highest forecast month (ties by their total), so the default
 * picks show the peaks.
 */
export function categorySeries(
  actual: { month: string; categories: ProjectionCategory[] }[],
  months: ProjectedMonth[]
): { names: string[]; rows: CategoryRow[] } {
  const first = months[0]?.month
  const toValues = (cs: ProjectionCategory[] = []) => Object.fromEntries(cs.map(c => [c.name, c.monthlyAmount]))
  const add = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100
    return out
  }
  const past = actual.filter(a => !first || a.month < first)
  const soFar = actual.find(a => a.month === first)
  const forecast = months.map((m, i) => ({
    month: m.month,
    values: i === 0 && soFar ? add(toValues(soFar.categories), toValues(m.categories)) : toValues(m.categories),
  }))

  const peak = new Map<string, number>()
  const total = new Map<string, number>()
  for (const f of forecast)
    for (const [name, v] of Object.entries(f.values)) {
      peak.set(name, Math.max(peak.get(name) ?? 0, v))
      total.set(name, (total.get(name) ?? 0) + v)
    }
  for (const p of past) for (const c of p.categories) if (!peak.has(c.name)) { peak.set(c.name, 0); total.set(c.name, 0) }
  const names = [...peak.keys()].sort((a, b) => peak.get(b)! - peak.get(a)! || total.get(b)! - total.get(a)!)
  const full = (values: Record<string, number>) => Object.fromEntries(names.map(n => [n, values[n] ?? 0]))

  const rows: CategoryRow[] = [
    ...past.map(p => ({ label: monthLabel(p.month), month: p.month, forecast: false, actual: full(toValues(p.categories)) })),
    ...forecast.map(f => ({ label: monthLabel(f.month), month: f.month, forecast: true, expected: full(f.values) })),
  ]
  // The forecast starts where the actual line ends
  const join = rows[past.length - 1]
  if (join?.actual) join.expected = join.actual
  return { names, rows }
}
