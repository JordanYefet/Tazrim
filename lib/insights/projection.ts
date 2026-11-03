/**
 * The balance forecast (ENG-87, docs/superpowers/specs/2026-11-02-projection-design.md).
 * Pure: the DB layer (lib/db/projection.ts) hands in plain rows.
 *
 * Each future month = recurring items on their own dates + everyday flows (the
 * median per category of the last complete months) + the card payment. The first
 * row is the latest data month: what is left of its usual amounts after the rows already in. Card
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

/** Rows of kept series, which the forecast places on their own dates (card-payment series aside) */
function recurringRowIds(series: ProjectionSeries[]): Set<string> {
  return new Set(series.filter(s => !s.dismissed && !s.isCardPayment).flatMap(s => s.transactionIds))
}

/**
 * What the bank rows of one month already hold, with the everyday exclusions: per category
 * (no recurring rows, no card payments), and the card payments made.
 */
export function seenInMonth(bank: BankFlowRow[], series: ProjectionSeries[], month: string) {
  const recurringIds = recurringRowIds(series)
  const income: Record<string, number> = {}
  const expense: Record<string, number> = {}
  let cardPaid = 0
  for (const r of bank) {
    if (monthKey(r.date) !== month) continue
    if (r.isCardPayment) { cardPaid += r.debit; continue }
    if (recurringIds.has(r.id)) continue
    const category = r.category ?? UNCATEGORIZED
    if (r.debit > 0) expense[category] = (expense[category] ?? 0) + r.debit
    if (r.credit > 0) income[category] = (income[category] ?? 0) + r.credit
  }
  return { income, expense, cardPaid }
}

/** The everyday (non-recurring) flows of the window months that have bank data */
export function everydayFlows(
  bank: BankFlowRow[],
  cards: CardChargeRow[],
  series: ProjectionSeries[],
  window: string[]
): Everyday {
  const recurringIds = recurringRowIds(series)
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

/**
 * The days (YYYY-MM-DD) a series hits after `after` (exclusive) and within `after`'s month,
 * by its own dates: for bank series, whose day in the month is known.
 */
export function hitsLeftInMonth(s: ProjectionSeries, after: string): string[] {
  const spec = cadenceSpec(s.cadence)
  const month = monthKey(after)
  const first = toDay(s.nextDate)
  const out: string[] = []
  for (let i = 0; ; i++) {
    const date = fmt(addCycles(first, spec, i))
    if (monthKey(date) > month) break
    if (date > after) out.push(date)
  }
  return out
}

/** The share of the month still to come after `date`: (days in month − day) / days in month */
export function restOfMonth(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return (days - d) / days
}

export interface ProjectionInput {
  /** YYYY-MM-DD */
  today: string
  cushion: number
  /** combined latest balance and the date of the latest row; null without bank data */
  start: { balance: number; date: string } | null
  /** non-ignored bank rows, from the window's first month on */
  bank: BankFlowRow[]
  /** non-ignored card rows of the cards in scope, from the window's first month on */
  cards: CardChargeRow[]
  series: ProjectionSeries[]
  /** actual month-end balances, oldest first: drawn before the forecast */
  past: { month: string; balance: number }[]
}

export interface ProjectedMonth {
  /** YYYY-MM */
  month: string
  income: number
  expense: number
  net: number
  expected: number
  low: number
  high: number
  /** between the latest data and today: projected, though it has already passed */
  stale: boolean
  tight: boolean
}

export interface ProjectionItem {
  key: string
  name: string
  kind: 'recurring' | 'everyday' | 'card'
  direction: 'in' | 'out'
  cadence: Cadence | null
  monthlyAmount: number
  /** the recurring series, for the link to /recurring */
  seriesKey: string | null
}

export type Projection =
  | { insufficient: true; completeMonths: number }
  | {
      insufficient: false
      start: { balance: number; date: string }
      end: ProjectedMonth
      months: ProjectedMonth[]
      tight: ProjectedMonth[]
      items: ProjectionItem[]
      past: { month: string; balance: number }[]
      cushion: number
      sigma: number
    }

export const CARD_ITEM_NAME = 'כרטיסי אשראי'

export function projectBalance(input: ProjectionInput): Projection {
  if (!input.start) return { insufficient: true, completeMonths: 0 }
  const last = monthKey(input.start.date)
  const window = Array.from({ length: WINDOW_MONTHS }, (_, i) => addMonths(last, i - WINDOW_MONTHS))
  const everyday = everydayFlows(input.bank, input.cards, input.series, window)
  if (everyday.months.length < MIN_MONTHS) return { insufficient: true, completeMonths: everyday.months.length }

  const thisMonth = monthKey(input.today)
  const end = addMonths(thisMonth, HORIZON_MONTHS)
  const recurring = projectedSeries(input.series)
  const hits = new Map<string, number>()
  const addHit = (m: string, amount: number) => hits.set(m, (hits.get(m) ?? 0) + amount)
  // Projected hits come from nextDate on, which lies after each series' latest row in the data
  for (const s of recurring) for (const m of occurrences(s, addMonths(last, 1), end)) addHit(m, s.latestAmount)
  // Card recurring charges already in the data are paid by the bank in their billing month,
  // which may be the latest data month or after it (charged before the data ended, billed later)
  const recurringIds = recurringRowIds(input.series)
  let cardRowsInLast = 0
  for (const c of input.cards) {
    if (!recurringIds.has(c.id)) continue
    const m = monthKey(c.billingDate)
    if (m === last) cardRowsInLast += c.amount
    else if (m > last && m <= end) addHit(m, c.amount)
  }

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  const fullIncome = sum(everyday.income)
  const baseExpense = sum(everyday.expense) + everyday.card

  // The first row is the latest data month itself: what is left of its usual amounts after the
  // rows already in, plus the bank recurring hits dated after the start date. The card's usual
  // payment (its everyday spending, plus the card recurring charges billed that month: those in the
  // data and any projected ones) less the card payments already made. Nothing is prorated: lumpy flows (a salary on the 1st) are not added twice.
  const seen = seenInMonth(input.bank, input.series, last)
  const rest = (usual: Record<string, number>, already: Record<string, number>) =>
    Object.entries(usual).reduce((a, [category, v]) => a + Math.max(0, v - (already[category] ?? 0)), 0)
  let cardHits = cardRowsInLast
  let bankHits = 0
  for (const s of recurring) {
    if (s.source === 'bank') bankHits += hitsLeftInMonth(s, input.start.date).length * s.latestAmount
    else cardHits += occurrences(s, last, last).length * s.latestAmount
  }
  const partial = {
    income: rest(everyday.income, seen.income),
    expense: rest(everyday.expense, seen.expense) + Math.max(0, everyday.card + cardHits - seen.cardPaid) + bankHits,
  }
  // The band still starts from the share of the month still to come
  const fraction = restOfMonth(input.start.date)

  const months: ProjectedMonth[] = []
  let expected = input.start.balance
  for (let month = last, n = 0; month <= end; month = addMonths(month, 1), n++) {
    const income = round2(n === 0 ? partial.income : fullIncome)
    const expense = round2(n === 0 ? partial.expense : baseExpense + (hits.get(month) ?? 0))
    const net = round2(income - expense)
    expected = round2(expected + net)
    const spread = round2(everyday.sigma * Math.sqrt(fraction + n))
    const low = round2(expected - spread)
    months.push({
      month, income, expense, net, expected, low,
      high: round2(expected + spread),
      stale: month <= thisMonth,
      tight: low < input.cushion,
    })
  }

  const items: ProjectionItem[] = [
    ...Object.entries(everyday.income).map(([name, v]) => item(`income:${name}`, name, 'everyday', 'in', v)),
    ...Object.entries(everyday.expense).map(([name, v]) => item(`expense:${name}`, name, 'everyday', 'out', v)),
    ...(everyday.card > 0 ? [item('card', CARD_ITEM_NAME, 'card', 'out', everyday.card)] : []),
    ...recurring.map(s => ({ ...item(`series:${s.key}`, s.name, 'recurring', 'out', s.monthlyAmount), cadence: s.cadence, seriesKey: s.key })),
  ]

  return {
    insufficient: false,
    start: input.start,
    end: months[months.length - 1],
    months,
    tight: months.filter(m => m.tight),
    items,
    past: input.past,
    cushion: input.cushion,
    sigma: everyday.sigma,
  }
}

function item(key: string, name: string, kind: ProjectionItem['kind'], direction: ProjectionItem['direction'], monthlyAmount: number): ProjectionItem {
  return { key, name, kind, direction, cadence: null, monthlyAmount: round2(monthlyAmount), seriesKey: null }
}
