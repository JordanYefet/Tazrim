/** One bank row as the balance chart gets it (newest first from the DB). */
export interface BalanceRow {
  date: string
  balance: number
  debit: number
  credit: number
  ignored: boolean
}

export interface BalancePoint {
  date: string
  balance: number
  /** Money in since the start of the period, this row included */
  income: number
  /** Money out since the start of the period, this row included */
  expense: number
}

/**
 * Oldest first, each row with the account's balance and the running income
 * and expense totals of the period. Ignored rows keep their balance (the
 * bank's own figure) but add nothing to the totals, like everywhere else.
 */
export function balanceSeries(rowsNewestFirst: BalanceRow[]): BalancePoint[] {
  let income = 0
  let expense = 0
  return [...rowsNewestFirst].reverse().map(r => {
    if (!r.ignored) {
      income += r.credit
      expense += r.debit
    }
    return { date: r.date, balance: r.balance, income, expense }
  })
}
