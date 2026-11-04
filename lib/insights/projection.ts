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
/** Everyday flows and the band come from up to this many complete months before the latest one */
export const WINDOW_MONTHS = 24
/** Months of actual balance the chart draws before the forecast */
export const PAST_MONTHS = 6
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
  /** the row's category (an override wins), for the forecast by category */
  category?: string | null
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
  /** the series' category, for the forecast by category */
  category?: string | null
}

export interface Everyday {
  /** window months that have bank data */
  months: string[]
  /** category → monthly median */
  income: Record<string, number>
  expense: Record<string, number>
  /** monthly card spending that isn't a recurring card charge */
  card: number
  /** population standard deviation of the monthly everyday net (around the seasonal usual, when seasonal) */
  sigma: number
  /** true when the window holds at least SEASONAL_MIN_MONTHS months: each calendar month gets its own usual */
  seasonal: boolean
  /** The usual everyday amounts for a calendar month ('01'…'12'): the medians, or seasonal ones */
  usualFor(calendarMonth: string): Usual
}

export interface Usual {
  income: Record<string, number>
  expense: Record<string, number>
  card: number
}

/** Seasonality needs at least a year: every calendar month has been seen once */
export const SEASONAL_MIN_MONTHS = 12

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

  const base: Usual = {
    income: medians(income, months),
    expense: medians(expense, months),
    card: months.length ? median(months.map(cardEveryday)) : 0,
  }
  const seasonal = months.length >= SEASONAL_MIN_MONTHS

  // Seasonality: a calendar month moves from the typical (median) month toward what that same
  // month held in past years. Two years or more count fully; a single year counts half, so a
  // one-off in last year's August isn't repeated in full.
  const lean = (typical: number, samples: number[]) => {
    if (samples.length === 0) return typical
    const same = samples.reduce((a, b) => a + b, 0) / samples.length
    const weight = samples.length >= 2 ? 1 : 0.5
    return Math.max(0, typical + weight * (same - typical))
  }
  const sameMonths = (cm: string) => months.filter(m => m.slice(5) === cm)
  const seasonalOf = (map: Map<string, Map<string, number>>, typical: Record<string, number>, cm: string) => {
    const out: Record<string, number> = {}
    const same = sameMonths(cm)
    for (const [category, byMonth] of map) {
      const v = round2(lean(typical[category] ?? 0, same.map(m => byMonth.get(m) ?? 0)))
      if (v > 0) out[category] = v
    }
    return out
  }
  const cache = new Map<string, Usual>()
  const usualFor = (cm: string): Usual => {
    if (!seasonal) return base
    let u = cache.get(cm)
    if (!u) {
      u = {
        income: seasonalOf(income, base.income, cm),
        expense: seasonalOf(expense, base.expense, cm),
        card: round2(lean(base.card, sameMonths(cm).map(cardEveryday))),
      }
      cache.set(cm, u)
    }
    return u
  }

  const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  const nets = months.map(m => sum(income, m) - sum(expense, m) - cardEveryday(m))
  // Seasonal: the band measures how far months strayed from their own usual, not from the year's
  const sigma = seasonal
    ? populationSd(
        months.map((m, i) => {
          const u = usualFor(m.slice(5))
          return nets[i] - (total(u.income) - total(u.expense) - u.card)
        })
      )
    : populationSd(nets)

  return { months, ...base, sigma, seasonal, usualFor }
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
  /** this month's expected spending by category, largest first (adds up to `expense`) */
  categories?: ProjectionCategory[]
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
      /** expected spending per month by category, largest first */
      categories: ProjectionCategory[]
      past: { month: string; balance: number }[]
      /**
       * What each category actually cost in the past months (the months of `past` before the
       * latest data month), and in the latest data month so far: drawn before the forecast
       */
      actualCategories: { month: string; categories: ProjectionCategory[] }[]
      cushion: number
      sigma: number
      /** each month follows its own season (a year or more of history) */
      seasonal: boolean
    }

export interface ProjectionCategory {
  name: string
  monthlyAmount: number
}

export const CARD_ITEM_NAME = 'כרטיסי אשראי'

/** How the everyday card spending of the window splits by the card rows' own categories (shares adding up to 1) */
function cardShares(cards: CardChargeRow[], recurringIds: Set<string>, window: string[]): [string, number][] {
  const inWindow = new Set(window.filter(Boolean))
  const byCategory = new Map<string, number>()
  for (const c of cards) {
    if (recurringIds.has(c.id) || !inWindow.has(monthKey(c.billingDate)) || c.amount <= 0) continue
    const name = c.category || UNCATEGORIZED
    byCategory.set(name, (byCategory.get(name) ?? 0) + c.amount)
  }
  const total = [...byCategory.values()].reduce((a, b) => a + b, 0)
  return total > 0 ? [...byCategory].map(([name, v]) => [name, v / total]) : []
}

type Bag = Map<string, number>
const put = (bag: Bag, name: string, v: number) => {
  if (v > 0) bag.set(name, (bag.get(name) ?? 0) + v)
}
const bagTotal = (bag: Bag) => [...bag.values()].reduce((a, b) => a + b, 0)
const ranked = (bag: Bag): ProjectionCategory[] =>
  [...bag]
    .map(([name, v]) => ({ name, monthlyAmount: round2(v) }))
    .filter(c => c.monthlyAmount > 0)
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)

/**
 * Expected spending per month by category: the everyday bank categories, the recurring series
 * (monthly equivalent) by their category, and the everyday card spending split by the card rows'
 * own categories over the window (all of it under "כרטיסי אשראי" when there are no card rows).
 */
export function categoryForecast(
  everyday: Everyday,
  recurring: ProjectionSeries[],
  cards: CardChargeRow[],
  recurringIds: Set<string>,
  window: string[]
): ProjectionCategory[] {
  const totals = new Map<string, number>()
  const add = (name: string, v: number) => totals.set(name, (totals.get(name) ?? 0) + v)
  for (const [name, v] of Object.entries(everyday.expense)) add(name, v)
  for (const s of recurring) add(s.category || UNCATEGORIZED, s.monthlyAmount)
  if (everyday.card > 0) {
    const inWindow = new Set(window)
    const byCategory = new Map<string, number>()
    for (const c of cards) {
      if (recurringIds.has(c.id) || !inWindow.has(monthKey(c.billingDate)) || c.amount <= 0) continue
      const name = c.category || UNCATEGORIZED
      byCategory.set(name, (byCategory.get(name) ?? 0) + c.amount)
    }
    const total = [...byCategory.values()].reduce((a, b) => a + b, 0)
    if (total > 0) for (const [name, v] of byCategory) add(name, (everyday.card * v) / total)
    else add(CARD_ITEM_NAME, everyday.card)
  }
  return [...totals]
    .map(([name, v]) => ({ name, monthlyAmount: round2(v) }))
    .filter(c => c.monthlyAmount > 0)
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
}

/**
 * What each category actually cost in a month, as the bank paid it: the bank's debits by their
 * category (card payments aside), and the card payments of that month split by the categories of
 * the card rows billed then (all under "כרטיסי אשראי" when the card files don't cover them).
 */
export function actualCategories(bank: BankFlowRow[], cards: CardChargeRow[], month: string): ProjectionCategory[] {
  const bag: Bag = new Map()
  let cardPaid = 0
  for (const r of bank) {
    if (monthKey(r.date) !== month || r.debit <= 0) continue
    if (r.isCardPayment) cardPaid += r.debit
    else put(bag, r.category ?? UNCATEGORIZED, r.debit)
  }
  if (cardPaid > 0) {
    const billed: Bag = new Map()
    for (const c of cards) if (monthKey(c.billingDate) === month && c.amount > 0) put(billed, c.category || UNCATEGORIZED, c.amount)
    const total = bagTotal(billed)
    // The card rows explain the payment up to what they hold; any rest stays under the cards
    const covered = Math.min(total, cardPaid)
    if (total > 0) for (const [name, v] of billed) put(bag, name, (covered * v) / total)
    put(bag, CARD_ITEM_NAME, cardPaid - covered)
  }
  return ranked(bag)
}

export function projectBalance(input: ProjectionInput): Projection {
  if (!input.start) return { insufficient: true, completeMonths: 0 }
  const last = monthKey(input.start.date)
  const window = Array.from({ length: WINDOW_MONTHS }, (_, i) => addMonths(last, i - WINDOW_MONTHS))
  const everyday = everydayFlows(input.bank, input.cards, input.series, window)
  if (everyday.months.length < MIN_MONTHS) return { insufficient: true, completeMonths: everyday.months.length }

  const thisMonth = monthKey(input.today)
  const end = addMonths(thisMonth, HORIZON_MONTHS)
  const recurring = projectedSeries(input.series)
  const recurringIds = recurringRowIds(input.series)
  const shares = cardShares(input.cards, recurringIds, window)
  // Seasonal: a month's card spending splits like the same month's card rows in past years
  // (a trip in August is billed in September), else like the whole window's
  const sharesFor = (month: string) => {
    if (!everyday.seasonal) return shares
    const same = cardShares(input.cards, recurringIds, window.filter(m => m.slice(5) === month.slice(5)))
    return same.length ? same : shares
  }
  // Card spending goes to the card rows' own categories (all of it to the cards without any)
  const putCard = (bag: Bag, amount: number, month: string) => {
    if (!(amount > 0)) return
    const split = sharesFor(month)
    if (split.length) for (const [name, share] of split) put(bag, name, amount * share)
    else put(bag, CARD_ITEM_NAME, amount)
  }
  const seriesOfRow = new Map<string, ProjectionSeries>()
  for (const s of input.series) if (!s.dismissed && !s.isCardPayment) for (const id of s.transactionIds) seriesOfRow.set(id, s)
  const categoryOfSeries = (s: ProjectionSeries | undefined) => s?.category || UNCATEGORIZED

  // Recurring hits by month and category
  const hits = new Map<string, Bag>()
  const hitBag = (m: string) => {
    let bag = hits.get(m)
    if (!bag) hits.set(m, (bag = new Map()))
    return bag
  }
  // Projected hits come from nextDate on, which lies after each series' latest row in the data
  for (const s of recurring) for (const m of occurrences(s, addMonths(last, 1), end)) put(hitBag(m), categoryOfSeries(s), s.latestAmount)
  // Card recurring charges already in the data are paid by the bank in their billing month,
  // which may be the latest data month or after it (charged before the data ended, billed later)
  const cardHitsInLast: Bag = new Map()
  for (const c of input.cards) {
    if (!recurringIds.has(c.id)) continue
    const m = monthKey(c.billingDate)
    const name = c.category || categoryOfSeries(seriesOfRow.get(c.id))
    if (m === last) put(cardHitsInLast, name, c.amount)
    else if (m > last && m <= end) put(hitBag(m), name, c.amount)
  }

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  // Each calendar month's usual everyday amounts (the same for every month unless seasonal)
  const usualOf = (month: string) => everyday.usualFor(month.slice(5))
  const firstUsual = usualOf(last)

  // The first row is the latest data month itself: what is left of its usual amounts after the
  // rows already in, plus the bank recurring hits dated after the start date. The card's usual
  // payment (its everyday spending, plus the card recurring charges billed that month: those in the
  // data and any projected ones) less the card payments already made. Nothing is prorated: lumpy
  // flows (a salary on the 1st) are not added twice.
  const seen = seenInMonth(input.bank, input.series, last)
  const rest = (usual: Record<string, number>, already: Record<string, number>) =>
    Object.entries(usual).reduce((a, [category, v]) => a + Math.max(0, v - (already[category] ?? 0)), 0)
  for (const s of recurring) if (s.source === 'card') put(cardHitsInLast, categoryOfSeries(s), occurrences(s, last, last).length * s.latestAmount)
  const cardHits = bagTotal(cardHitsInLast)
  const firstBag: Bag = new Map()
  for (const [name, v] of Object.entries(firstUsual.expense)) put(firstBag, name, v - (seen.expense[name] ?? 0))
  for (const s of recurring) if (s.source === 'bank') put(firstBag, categoryOfSeries(s), hitsLeftInMonth(s, input.start.date).length * s.latestAmount)
  // The card payment still to come, split like the card's usual payment (charges and everyday)
  const cardUsual = firstUsual.card + cardHits
  const cardLeft = Math.max(0, cardUsual - seen.cardPaid)
  if (cardUsual > 0 && cardLeft > 0) {
    const f = cardLeft / cardUsual
    for (const [name, v] of cardHitsInLast) put(firstBag, name, v * f)
    putCard(firstBag, firstUsual.card * f, last)
  }
  const partialIncome = rest(firstUsual.income, seen.income)
  // The band still starts from the share of the month still to come
  const fraction = restOfMonth(input.start.date)

  const months: ProjectedMonth[] = []
  let expected = input.start.balance
  for (let month = last, n = 0; month <= end; month = addMonths(month, 1), n++) {
    const usual = usualOf(month)
    let bag = firstBag
    if (n > 0) {
      bag = new Map()
      for (const [name, v] of Object.entries(usual.expense)) put(bag, name, v)
      putCard(bag, usual.card, month)
      for (const [name, v] of hits.get(month) ?? []) put(bag, name, v)
    }
    const income = round2(n === 0 ? partialIncome : sum(usual.income))
    const expense = round2(bagTotal(bag))
    const net = round2(income - expense)
    expected = round2(expected + net)
    const spread = round2(everyday.sigma * Math.sqrt(fraction + n))
    const low = round2(expected - spread)
    months.push({
      month, income, expense, net, expected, low,
      high: round2(expected + spread),
      stale: month <= thisMonth,
      tight: low < input.cushion,
      categories: ranked(bag),
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
    categories: categoryForecast(everyday, recurring, input.cards, recurringIds, window),
    past: input.past,
    actualCategories: [
      ...input.past.filter(p => p.month < last).map(p => ({ month: p.month, categories: actualCategories(input.bank, input.cards, p.month) })),
      { month: last, categories: actualCategories(input.bank, input.cards, last) },
    ],
    cushion: input.cushion,
    sigma: everyday.sigma,
    seasonal: everyday.seasonal,
  }
}

function item(key: string, name: string, kind: ProjectionItem['kind'], direction: ProjectionItem['direction'], monthlyAmount: number): ProjectionItem {
  return { key, name, kind, direction, cadence: null, monthlyAmount: round2(monthlyAmount), seriesKey: null }
}
