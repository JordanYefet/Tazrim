const MONTHS_HE = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
]

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function monthName(month: number): string {
  return MONTHS_HE[month - 1] ?? ''
}

const MONTHS_HE_SHORT = [
  'ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני',
  'יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳',
]

export function monthNameShort(month: number): string {
  return MONTHS_HE_SHORT[month - 1] ?? ''
}

export function monthsArray(): { value: number; label: string }[] {
  return MONTHS_HE.map((label, i) => ({ value: i + 1, label }))
}
