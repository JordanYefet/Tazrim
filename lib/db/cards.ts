import { Prisma } from '@prisma/client'
import { prisma, type Db } from './client'
import type { ParsedCCTransaction } from '../parsers/types'
import { accountWhere, listAccountIds, PROVIDERS, type AccountFilter } from './accounts'
import { getCardRules } from './aliases'
import { nameMatch, type NameFilter } from './name-filter'
import { getCategoryMap, mappedCategory } from './category-mappings'
import { cardDedupeKey, localDay, planCardImport } from '../upload/card-dedupe'

// Every function that takes an AccountFilter reads one card (an id), several
// cards (a list of ids) or every card (undefined).
//
// Months and years of card charges follow `billingDate`, the day the bank pays
// the card (ENG-46): an installment of a June purchase billed in September is
// September spending, so each month's card total matches the bank's card payment.
// That payment is already in the bank spending; card charges are its breakdown,
// never subtracted again. Upload de-duplication keeps using the purchase date.

/** `billingDate` range for a year, or one month of it */
function billedIn(year: number, month?: number): Prisma.DateTimeFilter {
  return {
    gte: new Date(year, month ? month - 1 : 0, 1),
    lt: month ? new Date(year, month, 1) : new Date(year + 1, 0, 1),
  }
}

/** Ids of every MAX card, archived ones included: what the /cards/max page and the dashboard show. */
export async function getMaxCardIds(): Promise<string[]> {
  return listAccountIds({ kind: 'CREDIT_CARD', provider: PROVIDERS.MAX, includeArchived: true })
}

/** An uploaded row that was not imported because the account already has it. */
export interface SkippedCardRow {
  /** Position of the row in the uploaded file, to import it anyway (`force`) */
  index: number
  /** Purchase day, YYYY-MM-DD */
  date: string
  billingDate: string
  merchant: string
  amount: number
  notes: string
  /** The stored row it matched */
  matched: { id: string; sourceFile: string; merchantName: string }
}

export interface CardUpsertResult {
  created: number
  skipped: number
  skippedRows: SkippedCardRow[]
}

/**
 * Inserts the rows into one card account, skipping rows the account already has
 * (same purchase, billing date and installment; see lib/upload/card-dedupe.ts).
 * Compares with every stored row of the account, the same file name included, so
 * re-uploading a statement adds only the rows that are missing. `force` lists
 * file rows to import even though they match.
 */
export async function upsertCCTransactions(
  transactions: ParsedCCTransaction[],
  fileName: string,
  accountId: string,
  opts: { force?: number[] } = {},
  /** Run inside a caller's transaction (re-import, ENG-65) */
  db: Db = prisma
): Promise<CardUpsertResult> {
  if (!transactions.length) return { created: 0, skipped: 0, skippedRows: [] }

  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const rules = await getCardRules(account.provider, db)
  const categories = await getCategoryMap(account.provider, db)

  const times = transactions.map(t => t.transactionDate.getTime())
  const stored = await db.creditCardTransaction.findMany({
    where: { accountId, transactionDate: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) } },
    select: {
      id: true,
      transactionDate: true,
      billingDate: true,
      originalMerchantName: true,
      chargedAmount: true,
      notes: true,
      sourceFile: true,
      merchantName: true,
    },
    orderBy: { id: 'asc' },
  })
  const byId = new Map(stored.map(s => [s.id, s]))
  const plan = planCardImport(transactions, stored, opts.force)

  const rowData = (i: number) => {
    const tx = transactions[i]
    const rule = rules.get(tx.originalMerchantName)
    return {
      accountId,
      transactionDate: tx.transactionDate,
      billingDate: tx.billingDate,
      originalMerchantName: tx.originalMerchantName,
      merchantName: rule?.displayName ?? tx.originalMerchantName,
      // Yours: the issuer's category through its mapping (ENG-75), or its own name
      category: mappedCategory(categories, tx.category),
      sourceCategory: tx.category,
      // A category set on the merchant before (Cal files carry none)
      categoryOverride: rule?.categoryOverride ?? null,
      chargedAmount: tx.chargedAmount,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency,
      chargedCurrency: tx.chargedCurrency || '₪',
      reference: tx.reference ?? '',
      cardLastFour: tx.cardLastFour,
      transactionType: tx.transactionType,
      notes: tx.notes,
      contentHash: cardDedupeKey(tx),
      sourceFile: fileName,
    }
  }
  if (db === prisma) {
    // All rows or none
    await prisma.$transaction(plan.create.map(i => prisma.creditCardTransaction.create({ data: rowData(i) })))
  } else {
    // Already inside the caller's transaction
    for (const i of plan.create) await db.creditCardTransaction.create({ data: rowData(i) })
  }

  const skippedRows: SkippedCardRow[] = plan.skip.map(({ index, matchedId }) => {
    const tx = transactions[index]
    const m = byId.get(matchedId)!
    return {
      index,
      date: localDay(tx.transactionDate),
      billingDate: localDay(tx.billingDate),
      merchant: tx.originalMerchantName,
      amount: tx.chargedAmount,
      notes: tx.notes,
      matched: { id: m.id, sourceFile: m.sourceFile, merchantName: m.merchantName },
    }
  })

  return { created: plan.create.length, skipped: plan.skip.length, skippedRows }
}

export async function getCCTransactions(params: {
  accountId?: AccountFilter
  month?: number
  year?: number
  search?: string
  merchant?: string
  category?: string
  showIgnored?: boolean
  take?: number
  skip?: number
}) {
  const where: Prisma.CreditCardTransactionWhereInput = {
    ...accountWhere(params.accountId),
  }

  // undefined and false both mean "exclude ignored rows"
  if (!params.showIgnored) {
    where.ignored = false
  }

  if (params.year) where.billingDate = billedIn(params.year, params.month)

  where.merchantName = nameMatch(params)

  // Top-level `ignored` is ANDed with every OR branch — no duplication needed.
  if (params.category) {
    where.OR = [
      { categoryOverride: params.category },
      { category: params.category, categoryOverride: null },
    ]
  }

  return prisma.creditCardTransaction.findMany({
    where,
    // Billing month first (the statement), then the purchase; id keeps paging stable
    orderBy: [{ billingDate: 'desc' }, { transactionDate: 'desc' }, { id: 'asc' }],
    ...(params.take !== undefined ? { take: params.take } : {}),
    ...(params.skip !== undefined ? { skip: params.skip } : {}),
  })
}

export async function updateCCTransaction(
  id: string,
  data: { merchantName?: string; category?: string; categoryOverride?: string; ignored?: boolean }
) {
  return prisma.creditCardTransaction.update({ where: { id }, data })
}

export async function getCCCategorySummary(accountId: AccountFilter, year: number, month?: number) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      billingDate: billedIn(year, month),
    },
  })

  const byCategory: Record<string, number> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    byCategory[cat] = (byCategory[cat] ?? 0) + tx.chargedAmount
  }

  return byCategory
}

/** Sets the category of every row with this merchant, on every card of `provider` (or every card). */
export async function bulkUpdateCCCategory(
  originalMerchantName: string,
  categoryOverride: string,
  provider?: string
) {
  return prisma.creditCardTransaction.updateMany({
    where: { originalMerchantName, ...(provider ? { account: { provider } } : {}) },
    data: { categoryOverride },
  })
}

export async function getCCCategoryStats(accountId: AccountFilter, year: number, month?: number, filter: NameFilter = {}) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      billingDate: billedIn(year, month),
      merchantName: nameMatch(filter),
    },
  })
  const stats: Record<string, { total: number; count: number }> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    if (!stats[cat]) stats[cat] = { total: 0, count: 0 }
    stats[cat].total += tx.chargedAmount
    stats[cat].count++
  }
  return stats
}

/** month (1-12) -> total charged, by billing month */
export async function getCCMonthlySummary(accountId: AccountFilter, year: number, filter: NameFilter = {}) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      billingDate: billedIn(year),
      merchantName: nameMatch(filter),
    },
  })

  const monthly: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) monthly[m] = 0

  for (const tx of txs) {
    const m = tx.billingDate.getMonth() + 1
    monthly[m] += tx.chargedAmount
  }

  return monthly
}

/**
 * Billing month (1-12) -> number of charges, for one year: the same rows as
 * getCCMonthlySummary (ignored rows excluded). `category` counts only that
 * category (its override when there is one), as the count tile does with a
 * category filter; a merchant or search counts only those merchants.
 */
export async function getCCMonthlyCounts(
  accountId: AccountFilter,
  year: number,
  opts: NameFilter & { category?: string } = {}
): Promise<Record<number, number>> {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      billingDate: billedIn(year),
      merchantName: nameMatch(opts),
      ...(opts.category
        ? { OR: [{ categoryOverride: opts.category }, { categoryOverride: null, category: opts.category }] }
        : {}),
    },
    select: { billingDate: true },
  })

  const counts: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) counts[m] = 0
  for (const tx of txs) counts[tx.billingDate.getMonth() + 1]++
  return counts
}

/** category -> billing month (1-12) -> total charged, for one year */
export async function getCCCategoryMonthly(accountId: AccountFilter, year: number, filter: NameFilter = {}) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      billingDate: billedIn(year),
      merchantName: nameMatch(filter),
    },
    select: { billingDate: true, category: true, categoryOverride: true, chargedAmount: true },
  })

  const result: Record<string, Record<number, number>> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    const m = tx.billingDate.getMonth() + 1
    result[cat] ??= {}
    result[cat][m] = (result[cat][m] ?? 0) + tx.chargedAmount
  }
  return result
}
