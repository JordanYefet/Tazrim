/**
 * Totals for the /banks and /cards pages. Bank accounts are only ever added to
 * bank accounts and cards to cards: bank expenses already include the card
 * payment, so card charges are a breakdown of them, never extra spending.
 */

export type BankMonthly = Record<number, { income: number; expense: number }>
export type CardMonthly = Record<number, number>

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function emptyBankMonthly(): BankMonthly {
  return Object.fromEntries(MONTHS.map(m => [m, { income: 0, expense: 0 }]))
}

export function emptyCardMonthly(): CardMonthly {
  return Object.fromEntries(MONTHS.map(m => [m, 0]))
}

// Month keys may be strings after a JSON round trip
const at = <T>(monthly: Record<number, T>, m: number): T | undefined =>
  monthly[m] ?? (monthly as Record<string, T>)[String(m)]

/** Several bank accounts' monthly income/expense, added month by month. */
export function sumBankMonthly(list: BankMonthly[]): BankMonthly {
  const sum = emptyBankMonthly()
  for (const monthly of list) {
    for (const m of MONTHS) {
      const v = at(monthly, m)
      if (!v) continue
      sum[m].income += v.income
      sum[m].expense += v.expense
    }
  }
  return sum
}

/** Several cards' monthly charges, added month by month. */
export function sumCardMonthly(list: CardMonthly[]): CardMonthly {
  const sum = emptyCardMonthly()
  for (const monthly of list) {
    for (const m of MONTHS) sum[m] += at(monthly, m) ?? 0
  }
  return sum
}

/**
 * The yearly monthly average: the year's total over the months that have any
 * value, so a missing upload doesn't drag it down. `activeIn` counts the
 * months from another series instead (a category's average over the months
 * with any card charges, as in the category × month table).
 */
export function monthlyAverage(monthly: CardMonthly, activeIn: CardMonthly = monthly): number {
  const total = MONTHS.reduce((s, m) => s + (at(monthly, m) ?? 0), 0)
  const active = MONTHS.filter(m => (at(activeIn, m) ?? 0) > 0).length
  return total / Math.max(active, 1)
}

/** How far a month is above (+) or below (-) the average, as a fraction; null without an average. */
export function averageDelta(value: number, average: number): number | null {
  return average > 0 ? (value - average) / average : null
}

/**
 * Income, expense and net for the selected month (or the whole year), and the
 * yearly average expense (always the whole year, so a month can be compared
 * with it). Bank-only: card charges are already inside these expenses.
 */
export function bankPeriodTotals(monthly: BankMonthly, month?: number) {
  const values = MONTHS.map(m => at(monthly, m) ?? { income: 0, expense: 0 })
  const picked = month ? [values[month - 1] ?? { income: 0, expense: 0 }] : values
  const income = picked.reduce((s, v) => s + v.income, 0)
  const expense = picked.reduce((s, v) => s + v.expense, 0)
  const averageExpense = monthlyAverage(Object.fromEntries(MONTHS.map(m => [m, values[m - 1].expense])))
  return { income, expense, net: income - expense, averageExpense }
}

/** Card charges for the selected month (or the year), and the yearly average over months with charges. */
export function cardPeriodTotals(monthly: CardMonthly, month?: number) {
  const values = MONTHS.map(m => at(monthly, m) ?? 0)
  const total = month ? (values[month - 1] ?? 0) : values.reduce((s, v) => s + v, 0)
  return { total, average: monthlyAverage(monthly) }
}

/** part / whole as a 0-1 fraction; 0 when the whole is 0. */
export function shareOf(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

/** Latest month (1-12) with any bank or card value, 0 when there is none. */
export function lastMonthWithData(monthly: BankMonthly | CardMonthly): number {
  let last = 0
  for (const m of MONTHS) {
    const v = at(monthly as Record<number, unknown>, m)
    const has = typeof v === 'number' ? v > 0 : !!v && ((v as { income: number }).income > 0 || (v as { expense: number }).expense > 0)
    if (has) last = m
  }
  return last
}

/**
 * A balance trend for the bank account element's sparkline (ENG-57): the
 * balance after the last row of each month, oldest month first, up to and
 * including `untilMonth` when given. Rows may come in any order; rows of the
 * same day keep their given order (the later one wins).
 */
export function monthEndBalances(
  rows: { date: Date; balance: number }[],
  untilMonth?: number
): { month: number; balance: number }[] {
  const last = new Map<number, { time: number; balance: number }>()
  for (const row of rows) {
    const month = row.date.getMonth() + 1
    if (untilMonth && month > untilMonth) continue
    const time = row.date.getTime()
    const seen = last.get(month)
    if (!seen || time >= seen.time) last.set(month, { time, balance: row.balance })
  }
  return [...last.entries()].sort(([a], [b]) => a - b).map(([month, v]) => ({ month, balance: v.balance }))
}
