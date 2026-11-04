import { monthNameShort } from '@/lib/utils/date'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import type { ProjectedMonth } from './projection'

/** '2031-03' → short month name and 2-digit year */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${monthNameShort(m)} ${String(y).slice(2)}`
}

const othersText = (n: number) => (n === 1 ? 'ועוד חודש' : n === 2 ? 'ועוד חודשיים' : `ועוד ${n} חודשים`)

/**
 * The one quiet line under the headline: the lowest tight month still ahead, and how many
 * others are still ahead. Months already passed (stale) count only when every tight month has.
 */
export function tightLine(tight: ProjectedMonth[]): string | null {
  const ahead = tight.filter(m => !m.stale)
  const pool = ahead.length ? ahead : tight
  if (pool.length === 0) return null
  const lowest = pool.reduce((a, m) => (m.low < a.low ? m : a))
  const others = pool.length - 1
  return `צפוי להיות דחוק ב${monthLabel(lowest.month)} — עד ${formatCurrencyWhole(lowest.low)}${others ? ` (${othersText(others)})` : ''}`
}
