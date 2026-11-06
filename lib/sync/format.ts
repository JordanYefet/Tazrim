/** Wording the sync sheet and its header button share (ENG-91). Client-safe. */

const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })

/** "לפני 3 שעות", "אתמול", "לפני 5 דקות"; "עכשיו" under a minute. */
export function timeAgo(iso: string, now = Date.now()): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000)
  if (Math.abs(secs) < 60) return 'עכשיו'
  const mins = Math.round(secs / 60)
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return rtf.format(days, 'day')
  return rtf.format(Math.round(days / 30), 'month')
}

export const FAILURE_TEXT: Record<string, string> = {
  INVALID_PASSWORD: 'שם המשתמש או הסיסמה שגויים',
  CHANGE_PASSWORD: 'האתר מבקש להחליף סיסמה. נכנסים לאתר, מחליפים אותה ומנסים שוב',
  ACCOUNT_BLOCKED: 'החשבון באתר חסום',
  TIMEOUT: 'האתר לא ענה בזמן. כדאי לנסות שוב',
  OTP: 'הקוד לא התקבל או שגוי',
  GENERIC: 'הסנכרון נכשל. כדאי לנסות שוב מאוחר יותר',
  STORE: 'התנועות נמשכו, אבל השמירה נכשלה',
  EXPIRED: 'הסנכרון בוטל',
}

export const STEP_TEXT: Record<string, string> = {
  starting: 'פותח את האתר',
  'logging-in': 'מתחבר',
  fetching: 'מושך תנועות',
  storing: 'שומר',
  done: 'שומר',
}

/** YYYY-MM-DD of local midnight `months` back (0: today). */
export function monthsBackDay(months: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "10.3.2030" from YYYY-MM-DD. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${d}.${m}.${y}`
}
