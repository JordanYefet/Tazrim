import { monthName } from '@/lib/utils/date'

/**
 * Twelve small bars (January to December) for a stat tile's mini chart: a
 * month -> value map turned into heights as a fraction of the year's largest
 * value, so the chart needs no axis and no chart library.
 */
export interface MonthBar {
  month: number
  value: number
  /** 0..1 of the tallest bar (0 for the future and for months without a value) */
  height: number
  /** After the latest month with data: drawn as a faint stub, not as "nothing spent" */
  future: boolean
  highlight: boolean
  /** Short month name under the bar, only on the few bars that get one */
  label?: string
}

export interface MonthBars {
  bars: MonthBar[]
  /** Where the average line sits, 0..1 of the chart's height; null without an average */
  averageAt: number | null
  /** The highlighted month (the selected one, else the latest with data), if any */
  highlightMonth?: number
  /** Latest month with a value, 0 when there is none */
  lastMonth: number
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// Month keys may be strings after a JSON round trip
const valueAt = (values: Record<number, number>, m: number): number => {
  const v = values[m] ?? (values as Record<string, number>)[String(m)] ?? 0
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function monthBars(
  values: Record<number, number>,
  opts: {
    /** The selected month (?month=); without one the latest month with data is highlighted */
    selectedMonth?: number
    /**
     * Draw a line at this value (e.g. the tile's own yearly average, so line
     * and figure always agree). `true` computes the average over the months
     * that have a value.
     */
    average?: number | true
  } = {}
): MonthBars {
  const vals = MONTHS.map(m => valueAt(values, m))
  const lastMonth = MONTHS.reduce((last, m) => (vals[m - 1] > 0 ? m : last), 0)

  const active = vals.filter(v => v > 0)
  const average =
    opts.average === true
      ? active.length
        ? active.reduce((s, v) => s + v, 0) / active.length
        : 0
      : (opts.average ?? 0)

  // The line stays inside the chart even when it is above every bar
  const max = Math.max(...vals, average > 0 ? average : 0)

  const selected = opts.selectedMonth && opts.selectedMonth >= 1 && opts.selectedMonth <= 12 ? opts.selectedMonth : undefined
  const highlightMonth = selected ?? (lastMonth || undefined)

  // Labels: the first and last month, plus the highlighted one where it sits;
  // an end label gives way when the highlighted one would touch it
  const labelled = new Set<number>()
  if (highlightMonth) labelled.add(highlightMonth)
  for (const end of [1, 12]) {
    if (!highlightMonth || Math.abs(highlightMonth - end) > 2 || highlightMonth === end) labelled.add(end)
  }

  const bars = MONTHS.map((month, i): MonthBar => {
    const future = month > lastMonth
    const value = vals[i]
    return {
      month,
      value,
      height: future || max === 0 ? 0 : value / max,
      future,
      highlight: month === highlightMonth,
      ...(labelled.has(month) ? { label: monthName(month) } : {}),
    }
  })

  return {
    bars,
    averageAt: average > 0 && max > 0 ? average / max : null,
    highlightMonth,
    lastMonth,
  }
}
