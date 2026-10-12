/** category -> month (1-12) -> amount */
export type CategoryMonthly = Record<string, Record<number, number>>

export type InsightKind = 'up' | 'down' | 'spike' | 'new'

export interface CategoryInsight {
  category: string
  current: number
  average: number
  delta: number
  /** null when there is no history to compare against */
  deltaPct: number | null
  kind: InsightKind
}

export interface CategoryInsights {
  month: number
  baselineMonths: number[]
  items: CategoryInsight[]
}

// Changes smaller than this (in ₪ or relative to the average) are noise
const MIN_DELTA = 200
const MIN_PCT = 0.2
// A jump this large is treated as a one-off rather than a trend
const SPIKE_RATIO = 2.5
const SPIKE_MIN_DELTA = 1000

function monthTotal(monthly: CategoryMonthly, month: number) {
  return Object.values(monthly).reduce((s, byMonth) => s + (byMonth[month] ?? 0), 0)
}

export function latestMonthWithData(monthly: CategoryMonthly): number | null {
  for (let m = 12; m >= 1; m--) {
    if (monthTotal(monthly, m) > 0) return m
  }
  return null
}

/** Categories ordered by total spend, biggest first — used for stable colors */
export function rankCategories(monthly: CategoryMonthly): string[] {
  const total = (c: string) => Object.values(monthly[c]).reduce((s, v) => s + v, 0)
  return Object.keys(monthly).sort((a, b) => total(b) - total(a))
}

/**
 * Compare each category's spend in `month` to its average over the earlier
 * months that have any data. Months where a category had no spend count as ₪0.
 */
export function computeCategoryInsights(
  monthly: CategoryMonthly,
  month: number,
  { limit = 5 }: { limit?: number } = {}
): CategoryInsights | null {
  if (monthTotal(monthly, month) <= 0) return null

  const baselineMonths = Array.from({ length: month - 1 }, (_, i) => i + 1)
    .filter(m => monthTotal(monthly, m) > 0)
  if (baselineMonths.length < 2) return null

  const items: CategoryInsight[] = []
  for (const [category, byMonth] of Object.entries(monthly)) {
    const current = byMonth[month] ?? 0
    const average = baselineMonths.reduce((s, m) => s + (byMonth[m] ?? 0), 0) / baselineMonths.length
    const delta = current - average

    if (Math.abs(delta) < MIN_DELTA) continue

    if (average === 0) {
      items.push({ category, current, average, delta, deltaPct: null, kind: 'new' })
      continue
    }

    const deltaPct = delta / average
    if (Math.abs(deltaPct) < MIN_PCT) continue

    const kind: InsightKind =
      delta < 0 ? 'down' : current >= average * SPIKE_RATIO && delta >= SPIKE_MIN_DELTA ? 'spike' : 'up'
    items.push({ category, current, average, delta, deltaPct, kind })
  }

  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return { month, baselineMonths, items: items.slice(0, limit) }
}
