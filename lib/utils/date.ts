// Month names are at most 4 characters across the app: long names are cut to three
// letters plus a geresh (אוקטובר -> אוק׳); short ones (מרץ, מאי, יוני, יולי) stay whole.
const MONTHS_HE = [
  'ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני',
  'יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳',
]

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function monthName(month: number): string {
  return MONTHS_HE[month - 1] ?? ''
}

/** Same as monthName: every month name is already short. */
export function monthNameShort(month: number): string {
  return monthName(month)
}

/** The selected period in words ("מרץ 2026" / "כל החודשים · 2026"), for sentences such as empty states. */
export function periodLabel(year: string | number, month?: number): string {
  return month ? `${monthName(month)} ${year}` : `כל החודשים · ${year}`
}

export function monthsArray(): { value: number; label: string }[] {
  return MONTHS_HE.map((label, i) => ({ value: i + 1, label }))
}
