/** One account's balance after a row (the DB gives them newest first). */
export interface BalancePoint {
  date: string
  balance: number
}

/**
 * Several accounts' balance points as one series, newest first (as the
 * balance chart takes them): at each row of any account, the sum of every
 * account's latest balance so far. An account counts from its first row in
 * the period on. One account comes back as it is.
 */
export function combinedBalance(perAccount: BalancePoint[][]): BalancePoint[] {
  const nonEmpty = perAccount.filter(rows => rows.length)
  if (nonEmpty.length <= 1) return nonEmpty[0] ?? []
  const events = nonEmpty
    .flatMap((rows, account) => rows.map((r, i) => ({ ...r, account, order: rows.length - i })))
    // Oldest first; same moment: each account's own row order
    .sort((a, b) => a.date.localeCompare(b.date) || a.account - b.account || a.order - b.order)
  const latest = new Map<number, number>()
  const out: BalancePoint[] = []
  for (const e of events) {
    latest.set(e.account, e.balance)
    let sum = 0
    for (const v of latest.values()) sum += v
    out.push({ date: e.date, balance: sum })
  }
  return out.reverse()
}
