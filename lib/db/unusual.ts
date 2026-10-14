import { prisma } from './client'
import { accountWhere, type AccountFilter } from './accounts'
import {
  detectUnusualTransactions,
  fromBankTransaction,
  fromCardTransaction,
  normalizeMerchant,
  type RecurringExemptions,
  type TransactionSource,
  type UnusualFlag,
  type UnusualTransaction,
} from '../insights/unusual'
import { isCardPaymentDescription } from '@/lib/insights/card-payment'

export type { TransactionSource, UnusualFlag, UnusualTransaction }

export const UNUSUAL_SOURCES: readonly TransactionSource[] = ['bank', 'card']

/**
 * Card categories where identical repeats are normal, so they are never
 * possible duplicates: MAX's category for person-to-person transfers.
 */
export const DUPLICATE_EXCLUDED_CATEGORIES = ['העברת כספים']

// The bank's monthly card payment; shared with the recurring detector.
export { isCardPaymentDescription }

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The period whose transactions can be flagged: the selected month, a past
 * year in full, or the last 90 days when looking at the current year.
 */
export function unusualRange({ year, month, now = new Date() }: { year: number; month?: number; now?: Date }) {
  if (month) return { since: ymd(new Date(year, month - 1, 1)), until: ymd(new Date(year, month, 0)) }
  if (year !== now.getFullYear()) return { since: ymd(new Date(year, 0, 1)), until: ymd(new Date(year, 11, 31)) }
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)
  return { since: ymd(since), until: ymd(now) }
}

/**
 * Newest non-ignored bank date or card billing date, to anchor "the last 90
 * days" to the data. Card rows count by billing date, like their period (ENG-46).
 */
export async function latestTransactionDate(): Promise<Date | null> {
  const [b, c] = await Promise.all([
    prisma.bankTransaction.findFirst({ where: { ignored: false }, orderBy: { date: 'desc' }, select: { date: true } }),
    prisma.creditCardTransaction.findFirst({
      where: { ignored: false },
      orderBy: { billingDate: 'desc' },
      select: { billingDate: true },
    }),
  ])
  const dates = [b?.date, c?.billingDate].filter((d): d is Date => !!d)
  return dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
}

export interface UnusualQuery {
  /** Accounts (bank and/or card ids) to check; undefined = every account */
  accountId?: AccountFilter
  /** Only flag transactions in this period (YYYY-MM-DD or Date); all history is still the baseline */
  since?: Date | string
  until?: Date | string
  /** Recurring-charge exemptions (ENG-37 series transaction ids go in `ids`) */
  recurring?: RecurringExemptions
}

/**
 * Flagged transactions, newest first, minus the ones the user dismissed. The
 * baseline is the full non-ignored history of the selected accounts; dismissed
 * rows still count as history. Card rows fall in `since`/`until` by billing
 * date; outlier history and duplicates compare purchase dates.
 */
export async function getUnusualTransactions(query: UnusualQuery = {}): Promise<UnusualTransaction[]> {
  const where = { ...accountWhere(query.accountId), ignored: false }
  const [bankRows, cardRows, dismissals] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      select: { id: true, accountId: true, date: true, description: true, originalDescription: true, debit: true, credit: true },
    }),
    prisma.creditCardTransaction.findMany({
      where,
      select: {
        id: true, accountId: true, transactionDate: true, billingDate: true, merchantName: true, chargedAmount: true,
        category: true, categoryOverride: true,
      },
    }),
    prisma.unusualDismissal.findMany({ select: { source: true, transactionId: true } }),
  ])

  const cardPaymentIds = new Set(
    bankRows
      .filter(r => isCardPaymentDescription(r.description) || isCardPaymentDescription(r.originalDescription))
      .map(r => r.id)
  )
  const flagged = detectUnusualTransactions(
    [...bankRows.map(fromBankTransaction), ...cardRows.map(fromCardTransaction)],
    {
      since: query.since,
      until: query.until,
      recurring: query.recurring,
      isExcluded: t => t.source === 'bank' && cardPaymentIds.has(t.id),
      duplicateExcludedCategories: DUPLICATE_EXCLUDED_CATEGORIES,
    }
  )

  const dismissed = new Set(dismissals.map(d => `${d.source}:${d.transactionId}`))
  return flagged.filter(u => !dismissed.has(`${u.source}:${u.id}`))
}

export type UnusualFlagMap = Record<TransactionSource, Record<string, UnusualFlag[]>>

/** Flags keyed by source and transaction id, for badges in the transaction tables */
export async function getUnusualFlagMap(query: UnusualQuery = {}): Promise<UnusualFlagMap> {
  const map: UnusualFlagMap = { bank: {}, card: {} }
  for (const u of await getUnusualTransactions(query)) map[u.source][u.id] = u.flags
  return map
}

export interface DismissalKey {
  source: TransactionSource
  transactionId: string
}

function assertKey({ source, transactionId }: DismissalKey) {
  if (!UNUSUAL_SOURCES.includes(source)) throw new Error(`Unknown source: ${String(source)}`)
  if (typeof transactionId !== 'string' || !transactionId) throw new Error('transactionId is required')
}

/** Marks a transaction as "not unusual". Idempotent. */
export async function dismissUnusual(key: DismissalKey & { reason?: string }) {
  assertKey(key)
  const { source, transactionId, reason } = key
  return prisma.unusualDismissal.upsert({
    where: { source_transactionId: { source, transactionId } },
    update: {},
    create: { source, transactionId, reason: reason ?? null },
  })
}

/** Undoes a dismissal. Idempotent. */
export async function undismissUnusual(key: DismissalKey) {
  assertKey(key)
  const { count } = await prisma.unusualDismissal.deleteMany({
    where: { source: key.source, transactionId: key.transactionId },
  })
  return { removed: count }
}
