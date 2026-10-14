// Which months are missing an uploaded statement (ENG-10). Pure: the caller
// (lib/db/missing-statements.ts) passes small per-day / per-month buckets.
//
// Conventions:
// - Months are "YYYY-MM" keys and dates "YYYY-MM-DD", in local time, so this
//   module never deals with time zones.
// - Card months are billing months: a card row belongs to the month of its
//   billingDate. A bank debit to the card company in month M pays the card
//   charges billed in month M (MAX's billing date is the day the bank is
//   debited), so a payment in M with no card rows billed in M means the
//   statement for M is missing.
// - Payments are attributed to a provider, not to a card: when several cards
//   share a provider, a month is missing only if none of them (archived ones
//   included) has rows billed in it. Every non-archived card of the provider
//   then lists that month.
// - By default a provider's card history starts at its first month with
//   billed rows (cardHistoryStart 'firstUpload'): earlier payments, and
//   providers with no billed rows at all, are not flagged.
// - A card month is never flagged while it is not fully billed: the current
//   month, and the bank's last month when the bank data ends before the
//   provider's usual payment day.
// - A bank account is missing a month when the month has no rows but lies
//   between its first and last months with rows. The edges are never flagged.
// - Only BANK and CREDIT_CARD accounts are checked; archived ones are skipped
//   (their rows still count as data and as payment evidence).
import { monthName } from '@/lib/utils/date'
import { cardPaymentProvider } from './card-payment'

export interface StatementAccount {
  id: string
  kind: 'BANK' | 'CREDIT_CARD' | 'TRADING' | 'PENSION'
  provider: string
  displayName: string
  archived: boolean
}

/** Bank rows of one account on one day */
export interface DayCount {
  accountId: string
  date: string
  count: number
}

/** Card rows of one account billed in one month */
export interface MonthCount {
  accountId: string
  month: string
  count: number
}

/** A bank row that may be a card-company payment (classified here) */
export interface PaymentRow {
  accountId: string
  date: string
  description: string
}

export interface MissingStatementsInput {
  accounts: StatementAccount[]
  bankDays: DayCount[]
  cardMonths: MonthCount[]
  payments: PaymentRow[]
  /** "YYYY-MM-DD" */
  today: string
  /** Where a provider's card history starts; see CardHistoryStart. Default 'firstUpload'. */
  cardHistoryStart?: CardHistoryStart
}

/**
 * - 'firstUpload' (default): only months on or after the provider's first month
 *   with billed rows (any of its cards, archived included). Older payments are
 *   from before the user started uploading that card on purpose, so they are
 *   not flagged; a provider with no billed rows at all gets no flags (a new
 *   account just shows its empty state).
 * - 'firstPayment': every month the bank paid the provider, back to the first
 *   payment, including providers with no billed rows yet.
 */
export type CardHistoryStart = 'firstUpload' | 'firstPayment'

export interface MissingStatement {
  accountId: string
  kind: 'BANK' | 'CREDIT_CARD'
  provider: string
  displayName: string
  /** Sorted "YYYY-MM" keys; empty when nothing is missing */
  months: string[]
}

/** How many recent payment months set a provider's usual payment day */
const USUAL_DAY_MONTHS = 6

const monthOf = (date: string) => date.slice(0, 7)
const dayOf = (date: string) => Number(date.slice(8, 10))

function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + (m - 1)
}

function monthFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** Missing months for every non-archived bank and card account, in input order */
export function detectMissingStatements(input: MissingStatementsInput): MissingStatement[] {
  const currentMonth = monthOf(input.today)
  const historyStart: CardHistoryStart = input.cardHistoryStart ?? 'firstUpload'

  // Bank months with rows, per account, and the last bank date overall
  const bankMonths = new Map<string, Set<string>>()
  let lastBankDate = ''
  for (const d of input.bankDays) {
    if (d.count <= 0) continue
    let set = bankMonths.get(d.accountId)
    if (!set) bankMonths.set(d.accountId, (set = new Set()))
    set.add(monthOf(d.date))
    if (d.date > lastBankDate) lastBankDate = d.date
  }

  // Card months with rows, per provider (archived cards included)
  const providerOf = new Map(input.accounts.map(a => [a.id, a.provider]))
  const billed = new Map<string, Set<string>>()
  for (const c of input.cardMonths) {
    const provider = providerOf.get(c.accountId)
    if (!provider || c.count <= 0) continue
    let set = billed.get(provider)
    if (!set) billed.set(provider, (set = new Set()))
    set.add(c.month)
  }

  // Payment days per provider and month
  const paid = new Map<string, Map<string, number[]>>()
  for (const p of input.payments) {
    const provider = cardPaymentProvider(p.description)
    if (!provider) continue
    let byMonth = paid.get(provider)
    if (!byMonth) paid.set(provider, (byMonth = new Map()))
    const month = monthOf(p.date)
    byMonth.set(month, [...(byMonth.get(month) ?? []), dayOf(p.date)])
  }

  const cardCache = new Map<string, string[]>()
  function missingCardMonths(provider: string): string[] {
    const cached = cardCache.get(provider)
    if (cached) return cached
    const byMonth = paid.get(provider) ?? new Map<string, number[]>()
    const paymentMonths = [...byMonth.keys()].sort()
    // Usual payment day: median of the first payment day in recent months
    const usualDay = paymentMonths.length
      ? median(paymentMonths.slice(-USUAL_DAY_MONTHS).map(m => Math.min(...byMonth.get(m)!)))
      : 1
    const lastBankMonth = monthOf(lastBankDate)
    const has = billed.get(provider) ?? new Set<string>()
    const firstBilled = [...has].sort()[0]
    if (historyStart === 'firstUpload' && !firstBilled) {
      cardCache.set(provider, [])
      return []
    }
    const out = paymentMonths.filter(m => {
      if (m >= currentMonth || has.has(m)) return false
      if (historyStart === 'firstUpload' && m < firstBilled) return false
      // the bank data stops before this month's usual payment went out
      if (m === lastBankMonth && dayOf(lastBankDate) < usualDay) return false
      return true
    })
    cardCache.set(provider, out)
    return out
  }

  function missingBankMonths(accountId: string): string[] {
    const set = bankMonths.get(accountId)
    if (!set || set.size < 2) return []
    const idx = [...set].map(monthIndex)
    const out: string[] = []
    for (let i = Math.min(...idx) + 1; i < Math.max(...idx); i++) {
      const m = monthFromIndex(i)
      if (!set.has(m)) out.push(m)
    }
    return out
  }

  const out: MissingStatement[] = []
  for (const a of input.accounts) {
    if (a.archived || (a.kind !== 'BANK' && a.kind !== 'CREDIT_CARD')) continue
    const months = a.kind === 'BANK' ? missingBankMonths(a.id) : missingCardMonths(a.provider)
    out.push({ accountId: a.id, kind: a.kind, provider: a.provider, displayName: a.displayName, months })
  }
  return out
}

/**
 * One notice per provider and kind: cards of the same provider list the same
 * months (payments are attributed to the provider), so they merge into one.
 */
export function groupByProvider(items: MissingStatement[]): MissingStatement[] {
  const groups = new Map<string, MissingStatement>()
  for (const item of items) {
    if (!item.months.length) continue
    const key = `${item.kind}|${item.provider}`
    const g = groups.get(key)
    if (!g) groups.set(key, { ...item, months: [...item.months] })
    else g.months = [...new Set([...g.months, ...item.months])].sort()
  }
  return [...groups.values()]
}

/** "אין פירוט מקס עבור יולי–ספט׳ 2026" / "חסרות תנועות לאומי עבור מרץ 2026" */
export function missingStatementMessage(kind: MissingStatement['kind'], label: string, months: string[]): string {
  const ranges = formatMonthRanges(months)
  return kind === 'CREDIT_CARD' ? `אין פירוט ${label} עבור ${ranges}` : `חסרות תנועות ${label} עבור ${ranges}`
}

/** For display: keep a range from wrapping at its dash (word joiners around it) */
export const noBreakAtDash = (text: string) => text.replace(/–/g, '⁠–⁠')

/**
 * "יולי–ספט׳ 2026", "נוב׳ 2025–ינו׳ 2026", "מרץ 2026, יולי 2026":
 * consecutive months collapse into a range, separate ranges are comma-joined.
 */
export function formatMonthRanges(months: string[]): string {
  const idx = [...new Set(months.map(monthIndex))].sort((a, b) => a - b)
  const runs: [number, number][] = []
  for (const i of idx) {
    const last = runs[runs.length - 1]
    if (last && i === last[1] + 1) last[1] = i
    else runs.push([i, i])
  }
  const label = (i: number, withYear: boolean) =>
    `${monthName((i % 12) + 1)}${withYear ? ` ${Math.floor(i / 12)}` : ''}`
  return runs
    .map(([a, b]) => {
      if (a === b) return label(a, true)
      const sameYear = Math.floor(a / 12) === Math.floor(b / 12)
      return `${label(a, !sameYear)}–${label(b, true)}`
    })
    .join(', ')
}
