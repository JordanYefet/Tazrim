/** One account's balance after a row (the DB gives them newest first). */
export interface BalancePoint {
  date: string
  balance: number
}

/**
 * Several accounts' balance points as one series, newest first (as the
 * balance chart takes them): at each row of any account, the sum of every
 * account's latest balance so far. `before[i]` is account i's last balance
 * before the period (undefined: no rows earlier): it counts from the start,
 * so an account idle in the period is carried forward, not dropped. An
 * account with neither rows nor an earlier balance contributes nothing.
 * One account comes back as it is.
 */
export function combinedBalance(perAccount: BalancePoint[][], before: (number | undefined)[] = []): BalancePoint[] {
  const known = perAccount.filter((rows, i) => rows.length || before[i] !== undefined)
  if (known.length <= 1) return perAccount.find(rows => rows.length) ?? []
  const events = perAccount
    .flatMap((rows, account) => rows.map((r, i) => ({ ...r, account, order: rows.length - i })))
    // Oldest first; same moment: each account's own row order
    .sort((a, b) => a.date.localeCompare(b.date) || a.account - b.account || a.order - b.order)
  const latest = new Map<number, number>()
  before.forEach((b, account) => {
    if (b !== undefined) latest.set(account, b)
  })
  const out: BalancePoint[] = []
  for (const e of events) {
    latest.set(e.account, e.balance)
    let sum = 0
    for (const v of latest.values()) sum += v
    out.push({ date: e.date, balance: sum })
  }
  return out.reverse()
}
