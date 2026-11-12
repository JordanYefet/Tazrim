/**
 * The day of the month a credit card is charged ("חיוב ב־2 לחודש" on its face in
 * the wallet), from its rows' billing dates. Each statement month has a main day
 * (the day most of its rows are billed on; a few rows, such as an immediate
 * charge, can fall on others). The card's day is the main day most of its last
 * `statements` months share, so a holiday or weekend that moves one charge does
 * not move the label, and an issuer that changes the day is followed within a
 * few months. A tie goes to the latest month's day. No rows: null.
 *
 * Dates are calendar days in local time (the server runs in Israeli time, like
 * the imports).
 */
export function billingDay(rows: { date: Date; count: number }[], statements = 6): number | null {
  const byMonth = new Map<string, Map<number, number>>()
  for (const r of rows) {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`
    const days = byMonth.get(key) ?? new Map<number, number>()
    days.set(r.date.getDate(), (days.get(r.date.getDate()) ?? 0) + r.count)
    byMonth.set(key, days)
  }
  // Latest months first; each month's main day (a tie: the earlier day)
  const mains = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, statements)
    .map(([, days]) => [...days.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0])
  if (!mains.length) return null
  const votes = new Map<number, number>()
  for (const d of mains) votes.set(d, (votes.get(d) ?? 0) + 1)
  const most = Math.max(...votes.values())
  // Latest first, so a tie goes to the most recent month's day
  return mains.find(d => votes.get(d) === most)!
}
