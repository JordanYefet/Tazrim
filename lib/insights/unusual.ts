/**
 * Unusual-transaction detection (ENG-38). Pure and schema-independent: callers
 * map their rows to `UnusualInput` (see the adapters at the bottom) and get back
 * the flagged transactions with the numbers behind each flag, so the UI can say
 * "9.7× your usual at X".
 *
 * Sign convention: `amount` is positive for money going out (bank debit, card
 * charge) and negative for money coming in (bank credit, card refund). Only
 * positive amounts are ever flagged or used as history.
 *
 * Flags:
 * - merchant_outlier: the merchant (normalized description) has at least
 *   `minMerchantHistory` earlier expenses, and this one is at least
 *   `merchantRatio`× their median AND above the largest of them. The median keeps
 *   a single past spike from inflating the norm; the "above the max" rule means
 *   an amount you've already paid there once is never "unusual".
 * - category_outlier: only when the merchant lacks that history. The category has
 *   at least `minCategoryHistory` earlier expenses (any merchant, any source) and
 *   this one is at least `categoryRatio`× their median AND above the largest of
 *   them. The ratio is higher than the merchant one because a category spans many
 *   kinds of purchase; the max rule matters even more here, since many small
 *   purchases pull a category's median far below an ordinary big shop.
 * - possible_duplicate: an earlier-or-same-day expense with the same source, the
 *   same account (when both have one), the same merchant and the exact same
 *   amount, at most `duplicateWindowDays` apart. Each later copy points at the
 *   first copy of its cluster. Installments ("תשלומים") repeat monthly, so a
 *   ~2-day window doesn't catch them; small legit repeats (two coffees) are cut
 *   by `minDuplicateAmount`. Bank and card rows never pair with each other. If an
 *   earlier, separate cluster of the same charge exists, it's a repeating pattern
 *   (e.g. two identical class fees every month) and only the first is flagged.
 *
 * Noise control:
 * - Outlier flags require `amount >= minAmount`.
 * - `recurring` exempts recurring charges (ENG-37 plugs in here) from the
 *   outlier checks only — a double-billed subscription is exactly what
 *   possible_duplicate should catch. `ids` and `isRecurring` exempt a
 *   transaction from both outlier flags; `merchantKeys` (compared with
 *   `normalizeMerchant`) exempt that merchant from category_outlier, but a price
 *   jump against its own history is still a merchant_outlier. Exempt rows still
 *   count as history.
 * - `duplicateExcludedCategories` skips the duplicate check for categories where
 *   identical repeats are normal (person-to-person transfers).
 * - `isExcluded` removes rows entirely: neither flagged nor used as history. Use
 *   it for the bank's monthly card-payment debit — card charges are already a
 *   breakdown of it, so it is large by construction and would double count, e.g.
 *   `isExcluded: t => t.source === 'bank' && isCardPaymentDescription(t.description)`.
 *   Also a good place for rows the user marked as ignored.
 * - `since` / `until` limit which transactions can be flagged; everything else
 *   still serves as history. They match `periodDate` when a row has one (a card
 *   row's billing date, ENG-46), else `date`. History, outliers and duplicates
 *   always use `date` (the purchase day).
 *
 * Output is deterministic: newest first, then larger amount, then id.
 */

export type TransactionSource = 'bank' | 'card'

export interface UnusualInput {
  id: string
  /** When it happened (purchase day): history, duplicates and display */
  date: Date | string
  /** The period it counts in for `since`/`until`, if not `date` (a card row's billing date) */
  periodDate?: Date | string
  /** Positive = expense, negative = income/refund */
  amount: number
  description: string
  source: TransactionSource
  accountId?: string
  category?: string | null
}

export interface RecurringExemptions {
  /** Transaction ids that are occurrences of a recurring charge */
  ids?: Iterable<string>
  /** Merchant keys (normalizeMerchant output) of recurring charges */
  merchantKeys?: Iterable<string>
  isRecurring?: (tx: UnusualInput) => boolean
}

export interface UnusualOptions {
  /** Smallest expense (₪) that can be a merchant/category outlier */
  minAmount?: number
  merchantRatio?: number
  minMerchantHistory?: number
  categoryRatio?: number
  minCategoryHistory?: number
  /** Smallest expense (₪) that can be a possible duplicate */
  minDuplicateAmount?: number
  duplicateWindowDays?: number
  recurring?: RecurringExemptions
  isExcluded?: (tx: UnusualInput) => boolean
  /** Only flag transactions on/after this day */
  since?: Date | string
  /** Only flag transactions on/before this day */
  until?: Date | string
  /** Categories never checked for duplicates (e.g. person-to-person transfers) */
  duplicateExcludedCategories?: Iterable<string>
}

export type UnusualReason = 'merchant_outlier' | 'category_outlier' | 'possible_duplicate'

export type UnusualFlag =
  | {
      reason: 'merchant_outlier'
      /** Median of earlier expenses at this merchant */
      baseline: number
      ratio: number
      historyCount: number
      maxPrior: number
    }
  | {
      reason: 'category_outlier'
      category: string
      /** Median of earlier expenses in this category */
      baseline: number
      ratio: number
      historyCount: number
      maxPrior: number
    }
  | {
      reason: 'possible_duplicate'
      duplicateOfId: string
      daysApart: number
    }

export interface UnusualTransaction {
  id: string
  /** YYYY-MM-DD (local) */
  date: string
  amount: number
  description: string
  merchantKey: string
  source: TransactionSource
  accountId?: string
  category: string | null
  flags: UnusualFlag[]
}

export const UNUSUAL_DEFAULTS = {
  minAmount: 200,
  merchantRatio: 3,
  minMerchantHistory: 3,
  categoryRatio: 4,
  minCategoryHistory: 5,
  minDuplicateAmount: 50,
  duplicateWindowDays: 2,
} as const

/** Lowercase, drop punctuation and long reference numbers, collapse spaces */
export function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/\d{3,}/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

interface Row {
  tx: UnusualInput
  day: number
  /** Day number of `periodDate ?? date`, matched against since/until */
  periodDay: number
  dateKey: string
  key: string
  category: string | null
}

function toDateKey(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10)
  const d = typeof date === 'string' ? new Date(date) : date
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Whole days since the epoch for a YYYY-MM-DD key (timezone independent) */
function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const cents = (n: number) => Math.round(n * 100)

const chronological = (a: Row, b: Row) => a.day - b.day || (a.tx.id < b.tx.id ? -1 : a.tx.id > b.tx.id ? 1 : 0)

export function detectUnusualTransactions(
  transactions: UnusualInput[],
  options: UnusualOptions = {}
): UnusualTransaction[] {
  const o = { ...UNUSUAL_DEFAULTS, ...options }
  const recurringIds = new Set(o.recurring?.ids ?? [])
  const recurringKeys = new Set(o.recurring?.merchantKeys ?? [])
  const sinceDay = o.since === undefined ? -Infinity : dayNumber(toDateKey(o.since))
  const untilDay = o.until === undefined ? Infinity : dayNumber(toDateKey(o.until))
  const duplicateExcluded = new Set(o.duplicateExcludedCategories ?? [])

  // Dedupe by id, keep expenses only, drop excluded rows
  const seen = new Set<string>()
  const rows: Row[] = []
  for (const tx of transactions) {
    if (seen.has(tx.id)) continue
    seen.add(tx.id)
    if (!(tx.amount > 0) || o.isExcluded?.(tx)) continue
    const dateKey = toDateKey(tx.date)
    const day = dayNumber(dateKey)
    const periodDay = tx.periodDate === undefined ? day : dayNumber(toDateKey(tx.periodDate))
    rows.push({ tx, dateKey, day, periodDay, key: normalizeMerchant(tx.description), category: tx.category ?? null })
  }
  rows.sort(chronological)

  const byMerchant = new Map<string, Row[]>()
  const byCategory = new Map<string, Row[]>()
  const push = (m: Map<string, Row[]>, k: string, r: Row) => {
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  for (const r of rows) {
    push(byMerchant, r.key, r)
    if (r.category) push(byCategory, r.category, r)
  }

  const result: UnusualTransaction[] = []
  for (const r of rows) {
    const { tx } = r
    if (r.periodDay < sinceDay || r.periodDay > untilDay) continue
    const recurringTx = recurringIds.has(tx.id) || !!o.recurring?.isRecurring?.(tx)
    const recurringMerchant = recurringKeys.has(r.key)
    const flags: UnusualFlag[] = []

    const merchantRows = byMerchant.get(r.key)!
    const priorAtMerchant = merchantRows.filter(p => p.day < r.day).map(p => p.tx.amount)

    if (tx.amount >= o.minAmount && !recurringTx) {
      if (priorAtMerchant.length >= o.minMerchantHistory) {
        const baseline = median(priorAtMerchant)
        const maxPrior = Math.max(...priorAtMerchant)
        const ratio = tx.amount / baseline
        if (ratio >= o.merchantRatio && tx.amount > maxPrior) {
          flags.push({ reason: 'merchant_outlier', baseline, ratio, historyCount: priorAtMerchant.length, maxPrior })
        }
      } else if (r.category && !recurringMerchant) {
        const prior = byCategory.get(r.category)!.filter(p => p.day < r.day).map(p => p.tx.amount)
        if (prior.length >= o.minCategoryHistory) {
          const baseline = median(prior)
          const maxPrior = Math.max(...prior)
          const ratio = tx.amount / baseline
          if (ratio >= o.categoryRatio && tx.amount > maxPrior) {
            flags.push({ reason: 'category_outlier', category: r.category, baseline, ratio, historyCount: prior.length, maxPrior })
          }
        }
      }
    }

    if (tx.amount >= o.minDuplicateAmount && !(r.category && duplicateExcluded.has(r.category))) {
      const original = firstOfDuplicateCluster(r, merchantRows, o.duplicateWindowDays)
      if (original) {
        flags.push({ reason: 'possible_duplicate', duplicateOfId: original.tx.id, daysApart: r.day - original.day })
      }
    }

    if (flags.length) {
      result.push({
        id: tx.id,
        date: r.dateKey,
        amount: tx.amount,
        description: tx.description,
        merchantKey: r.key,
        source: tx.source,
        ...(tx.accountId !== undefined && { accountId: tx.accountId }),
        category: r.category,
        flags,
      })
    }
  }

  return result.sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/**
 * Walk back through earlier copies (same source/account/amount) chained within
 * the window; return the first one, or null when `r` is itself the first or
 * when an earlier, separate cluster of the same charge already happened (a
 * repeating pattern such as two identical class fees every month).
 */
function firstOfDuplicateCluster(r: Row, merchantRows: Row[], windowDays: number): Row | null {
  const sameCharge = (p: Row) =>
    p.tx.source === r.tx.source &&
    cents(p.tx.amount) === cents(r.tx.amount) &&
    (p.tx.accountId === undefined || r.tx.accountId === undefined || p.tx.accountId === r.tx.accountId)
  // merchantRows is chronological; copies before `r` in that order are "earlier"
  const copies = merchantRows.slice(0, merchantRows.indexOf(r)).filter(sameCharge)
  let firstIndex = copies.length
  let cursor = r
  for (let i = copies.length - 1; i >= 0; i--) {
    if (cursor.day - copies[i].day > windowDays) break
    firstIndex = i
    cursor = copies[i]
  }
  if (firstIndex === copies.length) return null
  for (let i = 1; i < firstIndex; i++) {
    if (copies[i].day - copies[i - 1].day <= windowDays) return null
  }
  return copies[firstIndex]
}

// ---------- Adapters (structural, so they don't import Prisma types) ----------

export function fromBankTransaction(row: {
  id: string
  date: Date | string
  description: string
  debit: number
  credit: number
  accountId?: string
}): UnusualInput {
  return {
    id: row.id,
    date: row.date,
    amount: row.debit > 0 ? row.debit : -row.credit,
    description: row.description,
    source: 'bank',
    ...(row.accountId !== undefined && { accountId: row.accountId }),
    category: null,
  }
}

export function fromCardTransaction(row: {
  id: string
  transactionDate: Date | string
  /** When given, the row counts in its billing period (since/until) */
  billingDate?: Date | string
  merchantName: string
  chargedAmount: number
  category: string
  categoryOverride?: string | null
  accountId?: string
}): UnusualInput {
  return {
    id: row.id,
    date: row.transactionDate,
    ...(row.billingDate !== undefined && { periodDate: row.billingDate }),
    amount: row.chargedAmount,
    description: row.merchantName,
    source: 'card',
    ...(row.accountId !== undefined && { accountId: row.accountId }),
    category: row.categoryOverride ?? row.category,
  }
}
