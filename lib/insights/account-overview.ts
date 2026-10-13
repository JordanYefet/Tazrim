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
 * Income, expense and net for the selected month (or the whole year). The
 * yearly average expense counts only months that have any expense, so a
 * missing upload doesn't drag it down.
 */
export function bankPeriodTotals(monthly: BankMonthly, month?: number) {
  const values = MONTHS.map(m => at(monthly, m) ?? { income: 0, expense: 0 })
  const picked = month ? [values[month - 1] ?? { income: 0, expense: 0 }] : values
  const income = picked.reduce((s, v) => s + v.income, 0)
  const expense = picked.reduce((s, v) => s + v.expense, 0)
  const averageExpense = month
    ? undefined
    : expense / Math.max(values.filter(v => v.expense > 0).length, 1)
  return { income, expense, net: income - expense, averageExpense }
}

/** Card charges for the selected month (or the year), and the yearly average over months with charges. */
export function cardPeriodTotals(monthly: CardMonthly, month?: number) {
  const values = MONTHS.map(m => at(monthly, m) ?? 0)
  const total = month ? (values[month - 1] ?? 0) : values.reduce((s, v) => s + v, 0)
  const average = month ? undefined : total / Math.max(values.filter(v => v > 0).length, 1)
  return { total, average }
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

/** How many months (from January) a chart plots: past years all 12, otherwise up to now or the last data. */
export function plottedMonthCount(year: number, lastDataMonth: number, now = new Date()): number {
  if (year < now.getFullYear()) return 12
  return Math.max(year === now.getFullYear() ? now.getMonth() + 1 : 1, lastDataMonth)
}
