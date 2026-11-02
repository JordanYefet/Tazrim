/**
 * The balance forecast (ENG-87, docs/superpowers/specs/2026-11-02-projection-design.md).
 * Pure: the DB layer (lib/db/projection.ts) hands in plain rows.
 *
 * Each future month = recurring items on their own dates + everyday flows (the
 * median per category of the last complete months) + the card payment. Card
 * spending enters once, through the bank's card-payment debits less the card's
 * recurring charges, which are then placed on their own months (ENG-3: the bank
 * payment already holds the card charges, so they are never added twice).
 */
import { addCycles, cadenceSpec, fmt, median, toDay, type Cadence } from './recurring'
import { UNCATEGORIZED } from './bank-categories'

export const HORIZON_MONTHS = 12
export const WINDOW_MONTHS = 6
export const MIN_MONTHS = 3

export interface BankFlowRow {
  id: string
  /** YYYY-MM-DD */
  date: string
  debit: number
  credit: number
  category: string | null
  /** the bank's payment to a card company */
  isCardPayment: boolean
}

export interface CardChargeRow {
  id: string
  /** YYYY-MM-DD: the day the bank pays the card (ENG-46) */
  billingDate: string
  amount: number
}

export interface ProjectionSeries {
  key: string
  name: string
  source: 'bank' | 'card'
  cadence: Cadence
  latestAmount: number
  monthlyAmount: number
  /** YYYY-MM-DD */
  nextDate: string
  active: boolean
  dismissed: boolean
  isCardPayment: boolean
  isInstallment: boolean
  transactionIds: string[]
}

export interface Everyday {
  /** window months that have bank data */
  months: string[]
  /** category → monthly median */
  income: Record<string, number>
  expense: Record<string, number>
  /** monthly card spending that isn't a recurring card charge */
  card: number
  /** population standard deviation of the monthly everyday net */
  sigma: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function add(map: Map<string, Map<string, number>>, category: string, month: string, amount: number) {
  const byMonth = map.get(category) ?? new Map<string, number>()
  byMonth.set(month, (byMonth.get(month) ?? 0) + amount)
  map.set(category, byMonth)
}

function medians(map: Map<string, Map<string, number>>, months: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [category, byMonth] of map) {
    const m = median(months.map(month => byMonth.get(month) ?? 0))
    if (m > 0) out[category] = m
  }
  return out
}

function populationSd(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return round2(Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length))
}

/** The everyday (non-recurring) flows of the window months that have bank data */
export function everydayFlows(
  bank: BankFlowRow[],
  cards: CardChargeRow[],
  series: ProjectionSeries[],
  window: string[]
): Everyday {
  const kept = series.filter(s => !s.dismissed)
  const recurringIds = new Set(kept.filter(s => !s.isCardPayment).flatMap(s => s.transactionIds))
  const inWindow = new Set(window)
  const months = window.filter(m => bank.some(r => monthKey(r.date) === m))

  const income = new Map<string, Map<string, number>>()
  const expense = new Map<string, Map<string, number>>()
  const cardPaid = new Map<string, number>()
  const cardRecurring = new Map<string, number>()

  for (const r of bank) {
    const month = monthKey(r.date)
    if (!inWindow.has(month)) continue
    // Card payments first: their own series is a card-payment series, never "recurring" here
    if (r.isCardPayment) {
      cardPaid.set(month, (cardPaid.get(month) ?? 0) + r.debit)
      continue
    }
    if (recurringIds.has(r.id)) continue
    const category = r.category ?? UNCATEGORIZED
    if (r.debit > 0) add(expense, category, month, r.debit)
    if (r.credit > 0) add(income, category, month, r.credit)
  }
  for (const c of cards) {
    const month = monthKey(c.billingDate)
    if (inWindow.has(month) && recurringIds.has(c.id)) cardRecurring.set(month, (cardRecurring.get(month) ?? 0) + c.amount)
  }

  const cardEveryday = (m: string) => Math.max(0, (cardPaid.get(m) ?? 0) - (cardRecurring.get(m) ?? 0))
  const sum = (map: Map<string, Map<string, number>>, m: string) =>
    [...map.values()].reduce((a, byMonth) => a + (byMonth.get(m) ?? 0), 0)
  const nets = months.map(m => sum(income, m) - sum(expense, m) - cardEveryday(m))

  return {
    months,
    income: medians(income, months),
    expense: medians(expense, months),
    card: months.length ? median(months.map(cardEveryday)) : 0,
    sigma: populationSd(nets),
  }
}

/** The series the forecast places on their own dates */
export function projectedSeries(series: ProjectionSeries[]): ProjectionSeries[] {
  return series.filter(s => s.active && !s.dismissed && !s.isCardPayment)
}

/**
 * The bank months (from…to, inclusive) a series hits, one entry per hit. A card
 * subscription is charged on the card and paid by the bank the month after; an
 * instalment is already dated by its billing month (fromCardRow).
 */
export function occurrences(s: ProjectionSeries, from: string, to: string): string[] {
  const spec = cadenceSpec(s.cadence)
  const shift = s.source === 'card' && !s.isInstallment ? 1 : 0
  const first = toDay(s.nextDate)
  const out: string[] = []
  for (let i = 0; ; i++) {
    const month = addMonths(monthKey(fmt(addCycles(first, spec, i))), shift)
    if (month > to) break
    if (month >= from) out.push(month)
  }
  return out
}
