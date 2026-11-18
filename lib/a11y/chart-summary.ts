/**
 * Text alternatives for charts (ENG-128). A chart is a picture to a screen reader, so each one
 * carries a short Hebrew summary of what it shows: the range it covers, the highest and lowest
 * point and the latest value. The numbers are the same ones the tooltip shows on hover.
 */

export interface ChartPoint {
  label: string
  value: number | null | undefined
}

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * One series in words: "הוצאות: מינואר עד דצמבר, הגבוה ביותר במרץ (4,200 ₪), הנמוך ביותר בפברואר (900 ₪)".
 * Empty points (months without data) are left out; no data at all says so.
 */
export function describeSeries(name: string, points: ChartPoint[], fmt: (n: number) => string): string {
  const real = points.filter((p): p is { label: string; value: number } => isNum(p.value))
  if (real.length === 0) return `${name}: אין נתונים`
  const first = real[0]
  const last = real[real.length - 1]
  let max = real[0]
  let min = real[0]
  for (const p of real) {
    if (p.value > max.value) max = p
    if (p.value < min.value) min = p
  }
  if (real.length === 1) return `${name}: ${first.label}, ${fmt(first.value)}`
  return (
    `${name}: מ${first.label} עד ${last.label}, ` +
    `הגבוה ביותר ב${max.label} (${fmt(max.value)}), הנמוך ביותר ב${min.label} (${fmt(min.value)}), ` +
    `האחרון ${fmt(last.value)}`
  )
}

/** Several series, one after the other */
export function describeSeriesSet(
  series: { name: string; points: ChartPoint[] }[],
  fmt: (n: number) => string
): string {
  return series.map(s => describeSeries(s.name, s.points, fmt)).join('. ')
}

/** Rows of a chart as points of one key: the row's `name` (or `labelKey`) is the label */
export function pointsOf<T extends object>(rows: T[], key: string, labelKey = 'name'): ChartPoint[] {
  return rows.map(r => {
    const row = r as Record<string, unknown>
    return { label: String(row[labelKey] ?? ''), value: row[key] as number | null | undefined }
  })
}

/** A donut or a share chart: the largest parts with their share of the whole ("מזון 40%, ..."), at most `top` */
export function describeShares(items: { name: string; value: number }[], fmt: (n: number) => string, top = 5): string {
  const real = items.filter(i => isNum(i.value) && i.value > 0).sort((a, b) => b.value - a.value)
  const total = real.reduce((s, i) => s + i.value, 0)
  if (real.length === 0 || total <= 0) return 'אין נתונים'
  const parts = real.slice(0, top).map(i => `${i.name} ${fmt(i.value)} (${Math.round((i.value / total) * 100)}%)`)
  const rest = real.length - parts.length
  return `${parts.join(', ')}${rest > 0 ? ` ועוד ${rest}` : ''}`
}
