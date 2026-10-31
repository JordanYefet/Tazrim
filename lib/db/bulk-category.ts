/**
 * One category for many transactions at once, bank rows and card charges
 * alike: each gets it as its own choice (never a rule), for the rows a rule
 * can't tell apart, like cheques. All or nothing.
 */
import { prisma, type Db } from './client'
import { applyBankCategoryMany, BankCategoryError } from './bank-categories'
import { searchWheres } from './search'
import { isCardPaymentRow, directionOf } from '../insights/bank-categories'
import type { SearchFilters } from '../search/query'

/** The most rows one save may change; more than any table loads, and it bounds the IN lists */
export const MAX_BULK = 2000

/**
 * Sets `category` as the override of every listed card charge (only those of
 * `accountId` when given), inside the caller's transaction, as a pick by hand that
 * no rule overwrites. A card charge always shows a category, so there is no
 * clearing: it must be an expense one.
 */
export async function applyCardCategoryMany(db: Db, idList: string[], category: string | null, accountId?: string) {
  const ids = [...new Set(idList)]
  if (category === null) throw new BankCategoryError('לחיוב בכרטיס חייבת להיות קטגוריה', 400)
  const found = await db.creditCardTransaction.count({ where: { id: { in: ids }, ...(accountId ? { accountId } : {}) } })
  if (found !== ids.length) throw new BankCategoryError('לא נמצא', 404)
  const cat = await db.category.findUnique({ where: { name: category } })
  if (!cat || cat.kind !== 'EXPENSE') throw new BankCategoryError('קטגוריית הוצאה לא קיימת', 400)
  await db.creditCardTransaction.updateMany({ where: { id: { in: ids } }, data: { categoryOverride: category, categoryManual: true } })
  return { updatedIds: ids }
}

/** The card table's bulk save: charges of one card */
export async function setCardCategoryMany(params: { accountId: string; ids: string[]; category: string | null }) {
  return prisma.$transaction(db => applyCardCategoryMany(db, params.ids, params.category, params.accountId))
}

export interface BulkTargets {
  bankIds: string[]
  cardIds: string[]
}

/** Search's bulk save: bank rows and card charges together, in one transaction */
export async function setCategoryMany(params: BulkTargets & { category: string | null }) {
  const { bankIds, cardIds, category } = params
  if (!bankIds.length && !cardIds.length) throw new BankCategoryError('לא נבחרו תנועות', 400)
  if (bankIds.length + cardIds.length > MAX_BULK) {
    throw new BankCategoryError(`אפשר לשנות עד ${MAX_BULK} תנועות בבת אחת`, 400)
  }
  return prisma.$transaction(async db => {
    if (cardIds.length && category !== null) {
      const cat = await db.category.findUnique({ where: { name: category } })
      if (cat?.kind === 'INCOME') throw new BankCategoryError('נבחרו חיובים בכרטיס: הם מקבלים קטגוריית הוצאה', 400)
    }
    const bank = bankIds.length ? await applyBankCategoryMany(db, bankIds, category) : { updatedIds: [] }
    const card = cardIds.length ? await applyCardCategoryMany(db, cardIds, category) : { updatedIds: [] }
    return { bankIds: bank.updatedIds, cardIds: card.updatedIds }
  })
}

export interface BulkSummary extends BulkTargets {
  /** Bank rows going out and coming in (the picker offers expense or income categories) */
  bankOut: number
  bankIn: number
}

/**
 * Every row a search matches that can take a category: hidden rows and the
 * bank's card payments are left out, as their category pills are. Null when
 * the search matches more than MAX_BULK of them.
 */
export async function bulkTargetsFor(filters: SearchFilters): Promise<BulkSummary | null> {
  const { cursor: _cursor, ...rest } = filters
  const f: SearchFilters = { ...rest, includeIgnored: false }
  const { bank, card } = (await searchWheres(f))(f)
  const [bankRows, cardRows] = await Promise.all([
    bank
      ? prisma.bankTransaction.findMany({
          where: bank,
          select: { id: true, description: true, originalDescription: true, debit: true, credit: true },
          take: MAX_BULK + 1,
        })
      : [],
    prisma.creditCardTransaction.findMany({ where: card, select: { id: true }, take: MAX_BULK + 1 }),
  ])
  const banks = bankRows.filter(r => !isCardPaymentRow(r))
  if (banks.length + cardRows.length > MAX_BULK) return null
  const bankOut = banks.filter(r => directionOf(r) === 'OUT').length
  return {
    bankIds: banks.map(r => r.id),
    cardIds: cardRows.map(r => r.id),
    bankOut,
    bankIn: banks.length - bankOut,
  }
}
