import { Prisma } from '@prisma/client'
import { prisma, type Db } from './client'
import type { ParsedBankTransaction } from '../parsers/types'
import { accountWhere, type AccountFilter } from './accounts'
import { getAliasMap } from './aliases'
import { getBankCategoryRules, ruleCategoryFor } from './bank-categories'
import { bankRowCategory } from '../insights/bank-categories'
import { localDay } from '../upload/card-dedupe'
import { monthEndBalances } from '../insights/account-overview'

/** An uploaded bank row that was not imported because the account already has it. */
export interface SkippedBankRow {
  index: number
  /** YYYY-MM-DD */
  date: string
  description: string
  /** Debit as a positive amount, credit as a negative one */
  amount: number
  matched: { id: string; sourceFile: string }
}

/**
 * Inserts the rows into one bank account, skipping rows that account already
 * has. `db`: run inside a caller's transaction (re-import, ENG-65).
 */
export async function upsertBankTransactions(
  transactions: ParsedBankTransaction[],
  accountId: string,
  db: Db = prisma
): Promise<{ created: number; skipped: number; skippedRows: SkippedBankRow[] }> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const aliasMap = await getAliasMap(account.provider, db)
  const rules = await getBankCategoryRules(account.provider, db)

  let created = 0
  let skipped = 0
  const skippedRows: SkippedBankRow[] = []

  for (const [index, tx] of transactions.entries()) {
    const existing = await db.bankTransaction.findFirst({
      where: {
        accountId,
        date: tx.date,
        originalDescription: tx.originalDescription,
        debit: tx.debit,
        credit: tx.credit,
      },
    })
    if (existing) {
      skipped++
      skippedRows.push({
        index,
        date: localDay(tx.date),
        description: tx.originalDescription,
        amount: tx.debit ? tx.debit : -tx.credit,
        matched: { id: existing.id, sourceFile: existing.sourceFile },
      })
      continue
    }

    const description = aliasMap.get(tx.originalDescription) ?? tx.originalDescription
    await db.bankTransaction.create({
      data: {
        accountId,
        date: tx.date,
        originalDescription: tx.originalDescription,
        description,
        // A category rule saved for this description and direction
        category: ruleCategoryFor(rules, { ...tx, description }),
        debit: tx.debit,
        credit: tx.credit,
        balance: tx.balance,
        note: tx.note,
        sourceFile: tx.sourceFile,
      },
    })
    created++
  }

  return { created, skipped, skippedRows }
}

/** `accountId` omitted = every bank account. */
export async function getBankTransactions(params: {
  accountId?: AccountFilter
  month?: number
  year?: number
  search?: string
  merchant?: string
  /** A category, or the uncategorized / card-payment bucket (lib/insights/bank-categories) */
  category?: string
  showIgnored?: boolean
  take?: number
  skip?: number
}) {
  const where: Prisma.BankTransactionWhereInput = { ...accountWhere(params.accountId) }

  if (params.year) {
    const m = params.month
    where.date = {
      gte: new Date(params.year, m ? m - 1 : 0, 1),
      lte: m
        ? new Date(params.year, m, 0, 23, 59, 59)
        : new Date(params.year, 12, 0, 23, 59, 59),
    }
  }

  if (params.merchant) {
    where.description = params.merchant
  } else if (params.search) {
    where.description = { contains: params.search }
  }

  if (!params.showIgnored) {
    where.ignored = false
  }

  if (params.category) {
    // The buckets depend on the card-payment patterns, so the category is
    // matched in JS over the period's rows (hundreds a year), then paged
    const rows = await prisma.bankTransaction.findMany({ where, orderBy: { date: 'desc' } })
    const matching = rows.filter(r => bankRowCategory(r) === params.category)
    const start = params.skip ?? 0
    return matching.slice(start, params.take !== undefined ? start + params.take : undefined)
  }

  return prisma.bankTransaction.findMany({
    where,
    orderBy: { date: 'desc' },
    ...(params.take !== undefined ? { take: params.take } : {}),
    ...(params.skip !== undefined ? { skip: params.skip } : {}),
  })
}

export async function updateBankTransaction(
  id: string,
  data: { description?: string; note?: string; ignored?: boolean }
) {
  return prisma.bankTransaction.update({ where: { id }, data })
}

/**
 * One account's balance at the end of each month of `year` that has rows, up
 * to `untilMonth` when given (ENG-57 sparkline). Ignored rows still carry the
 * bank's running balance, so they count.
 */
export async function getBankBalanceTrend(accountId: string, year: number, untilMonth?: number) {
  const rows = await prisma.bankTransaction.findMany({
    where: { accountId, date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) } },
    orderBy: { date: 'asc' },
    select: { date: true, balance: true },
  })
  return monthEndBalances(rows, untilMonth)
}

/** Monthly income/expense; `accountId` omitted = every bank account. */
export async function getBankMonthlySummary(year: number, accountId?: AccountFilter) {
  const txs = await prisma.bankTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
  })

  const monthly: Record<number, { income: number; expense: number }> = {}
  for (let m = 1; m <= 12; m++) monthly[m] = { income: 0, expense: 0 }

  for (const tx of txs) {
    const m = tx.date.getMonth() + 1
    monthly[m].income += tx.credit
    monthly[m].expense += tx.debit
  }

  return monthly
}
