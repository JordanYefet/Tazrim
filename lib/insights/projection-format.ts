import { monthNameShort } from '@/lib/utils/date'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import type { ProjectedMonth } from './projection'

/** '2031-03' → short month name and 2-digit year */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${monthNameShort(m)} ${String(y).slice(2)}`
}

/** The one quiet line under the headline: the lowest tight month, and how many others */
export function tightLine(tight: ProjectedMonth[]): string | null {
  if (tight.length === 0) return null
  const lowest = tight.reduce((a, m) => (m.low < a.low ? m : a))
  const others = tight.length - 1
  return `צפוי להיות דחוק ב${monthLabel(lowest.month)} — עד ${formatCurrencyWhole(lowest.low)}${others ? ` (ועוד ${others} חודשים)` : ''}`
}
