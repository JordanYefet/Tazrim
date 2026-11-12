export interface MonthProgress {
  /** The month has not finished yet (it is this month, in Israel) */
  inProgress: boolean
  /** The day of the month it is today; 0 for a month that has not started */
  day: number
  daysInMonth: number
}

/** Year, month and day of `now` on the Israeli calendar, wherever the server runs. */
function israelDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/**
 * Where a month stands today: finished (past), in progress (this month, so its
 * totals are partial and compare with nothing), or not started (future).
 */
export function monthProgress(year: number, month: number, now: Date = new Date()): MonthProgress {
  const today = israelDate(now)
  const daysInMonth = new Date(year, month, 0).getDate()
  const index = year * 12 + month
  const current = today.year * 12 + today.month
  if (index < current) return { inProgress: false, day: daysInMonth, daysInMonth }
  if (index > current) return { inProgress: false, day: 0, daysInMonth }
  return { inProgress: true, day: today.day, daysInMonth }
}

/**
 * The months of `monthly` that are over: drops the month in progress (and any
 * later one), so a partial month never drags an average down.
 */
export function finishedMonths<T>(year: number, monthly: Record<string, T>, now: Date = new Date()): Record<string, T> {
  return Object.fromEntries(
    Object.entries(monthly).filter(([m]) => {
      const p = monthProgress(year, Number(m), now)
      return !p.inProgress && p.day > 0
    })
  )
}
