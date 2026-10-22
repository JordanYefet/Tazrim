import { monthName } from '@/lib/utils/date'

/**
 * Rows for a monthly bar chart (ENG-70): always January to December, so every
 * month the picker offers is on the chart. A month without any value in any
 * of the chart's series is `empty` and its values are null: Recharts draws no
 * bar there (an empty slot, not a bar that reads as "₪0 spent").
 */
export type YearChartRow<K extends string> = { month: number; name: string; empty: boolean } & Record<K, number | null>

export const YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function yearChartRows<K extends string>(
  keys: readonly K[],
  value: (month: number, key: K) => number | undefined
): YearChartRow<K>[] {
  return YEAR_MONTHS.map(month => {
    const values = keys.map(k => [k, value(month, k) ?? 0] as const)
    const empty = values.every(([, v]) => !v)
    const row = { month, name: monthName(month), empty } as YearChartRow<K>
    for (const [k, v] of values) (row as Record<string, unknown>)[k] = empty ? null : v
    return row
  })
}

