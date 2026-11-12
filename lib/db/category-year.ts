/**
 * The rows behind a category's year (lib/insights/category-year.ts): the bank rows
 * and card charges of one category over a year, as search results that know the
 * month they count in (billing month for cards, calendar month for bank rows, as
 * every monthly figure in the app). Ignored rows are left out, as in the totals.
 */
import { prisma } from './client'
import { accountWhere } from './accounts'
import { merchantYear, type CategoryYearRow, type MerchantYear } from '../insights/category-year'

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const yearRange = (year: number) => ({ gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) })

const bankSelect = {
  id: true,
  accountId: true,
  date: true,
  description: true,
  originalDescription: true,
  debit: true,
  credit: true,
  note: true,
  reference: true,
  ignored: true,
  account: { select: { displayName: true } },
} as const

const cardSelect = {
  id: true,
  accountId: true,
  transactionDate: true,
  billingDate: true,
  merchantName: true,
  originalMerchantName: true,
  chargedAmount: true,
  category: true,
  categoryOverride: true,
  notes: true,
  reference: true,
  ignored: true,
  account: { select: { displayName: true } },
} as const

type BankRow = { id: string; accountId: string; date: Date; description: string; originalDescription: string; debit: number; credit: number; note: string; reference: string; ignored: boolean; account: { displayName: string } }
type CardRow = { id: string; accountId: string; transactionDate: Date; billingDate: Date; merchantName: string; originalMerchantName: string; chargedAmount: number; category: string; categoryOverride: string | null; notes: string; reference: string; ignored: boolean; account: { displayName: string } }

function bankResult(tx: BankRow, category?: string): CategoryYearRow {
  return {
    id: tx.id,
    source: 'bank',
    accountId: tx.accountId,
    accountName: tx.account.displayName,
    date: ymd(tx.date),
    dateMs: tx.date.getTime(),
    month: tx.date.getMonth() + 1,
    description: tx.description,
    ...(tx.originalDescription !== tx.description ? { originalDescription: tx.originalDescription } : {}),
    amount: tx.debit - tx.credit,
    ...(category ? { category } : {}),
    ...(tx.note ? { note: tx.note } : {}),
    ...(tx.reference ? { reference: tx.reference } : {}),
    ignored: tx.ignored,
  }
}

function cardResult(tx: CardRow): CategoryYearRow {
  return {
    id: tx.id,
    source: 'card',
    accountId: tx.accountId,
    accountName: tx.account.displayName,
    date: ymd(tx.transactionDate),
    dateMs: tx.transactionDate.getTime(),
    month: tx.billingDate.getMonth() + 1,
    description: tx.merchantName,
    ...(tx.originalMerchantName !== tx.merchantName ? { originalDescription: tx.originalMerchantName } : {}),
    amount: tx.chargedAmount,
    category: tx.categoryOverride ?? tx.category,
    ...(tx.notes ? { note: tx.notes } : {}),
    ...(tx.reference ? { reference: tx.reference } : {}),
    ignored: tx.ignored,
  }
}

/**
 * Every row of `category` in `year`: the bank accounts' rows in the category's
 * direction (debits for an expense category, credits for an income one) and, for an
 * expense category, the cards' charges (the override when set, else the statement
 * category). Card payments never carry a category, so they are never here.
 */
export async function getCategoryYearRows({
  bankIds,
  cardIds,
  year,
  category,
  kind,
}: {
  bankIds: string[]
  cardIds: string[]
  year: number
  category: string
  kind: 'EXPENSE' | 'INCOME'
}): Promise<CategoryYearRow[]> {
  const [bankRows, cardRows] = await Promise.all([
    bankIds.length
      ? prisma.bankTransaction.findMany({
          where: {
            ...accountWhere(bankIds),
            ignored: false,
            date: yearRange(year),
            category,
            ...(kind === 'INCOME' ? { credit: { gt: 0 } } : { debit: { gt: 0 } }),
          },
          select: bankSelect,
        })
      : [],
    cardIds.length && kind === 'EXPENSE'
      ? prisma.creditCardTransaction.findMany({
          where: {
            ...accountWhere(cardIds),
            ignored: false,
            billingDate: yearRange(year),
            OR: [{ categoryOverride: category }, { categoryOverride: null, category }],
          },
          select: cardSelect,
        })
      : [],
  ])
  return [...bankRows.map(r => bankResult(r, category)), ...cardRows.map(cardResult)]
}

/**
 * One merchant's year, from one of its rows: every card charge with the same
 * original merchant name (any card) billed in `year`, or every bank row with the same
 * original description going the same way (any bank account) in `year`. Null when the
 * row does not exist.
 */
export async function getMerchantYear({ source, id, year }: { source: 'bank' | 'card'; id: string; year: number }): Promise<MerchantYear | null> {
  if (source === 'card') {
    const row = await prisma.creditCardTransaction.findUnique({ where: { id }, select: { originalMerchantName: true, merchantName: true } })
    if (!row) return null
    const rows = await prisma.creditCardTransaction.findMany({
      where: { originalMerchantName: row.originalMerchantName, ignored: false, billingDate: yearRange(year) },
      select: { billingDate: true, chargedAmount: true },
    })
    return merchantYear(
      row.merchantName,
      year,
      rows.map(r => ({ month: r.billingDate.getMonth() + 1, amount: r.chargedAmount })),
      'EXPENSE'
    )
  }
  const row = await prisma.bankTransaction.findUnique({ where: { id }, select: { originalDescription: true, description: true, debit: true } })
  if (!row) return null
  const income = row.debit <= 0
  const rows = await prisma.bankTransaction.findMany({
    where: {
      originalDescription: row.originalDescription,
      ignored: false,
      date: yearRange(year),
      ...(income ? { credit: { gt: 0 } } : { debit: { gt: 0 } }),
    },
    select: { date: true, debit: true, credit: true },
  })
  return merchantYear(
    row.description,
    year,
    rows.map(r => ({ month: r.date.getMonth() + 1, amount: r.debit - r.credit })),
    income ? 'INCOME' : 'EXPENSE'
  )
}
