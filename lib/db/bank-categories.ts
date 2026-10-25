import { prisma, type Db } from './client'
import { accountWhere, type AccountFilter } from './accounts'
import { nameMatch, type NameFilter } from './name-filter'
import {
  bankRowCategory,
  CARD_PAYMENT_CATEGORY,
  CATEGORY_KIND_OF,
  directionOf,
  isCardPaymentRow,
  type BankDirection,
} from '../insights/bank-categories'
import type { CategoryMonthly } from '../insights/category-insights'
import { isGenericDescription, listGenericDescriptions } from './generic-descriptions'

const ruleKey = (direction: BankDirection, originalDescription: string) => `${direction}|${originalDescription}`

/** direction|originalDescription -> category, for one provider's bank rules. A generic description never has one. */
export async function getBankCategoryRules(provider: string, db: Db = prisma): Promise<Map<string, string>> {
  const generic = await listGenericDescriptions(db)
  const rules = await db.bankCategoryRule.findMany({ where: { provider, originalDescription: { notIn: generic } } })
  return new Map(rules.map(r => [ruleKey(r.direction as BankDirection, r.originalDescription), r.category]))
}

/** The rule's category for an incoming row, or null (card payments never get one). */
export function ruleCategoryFor(
  rules: Map<string, string>,
  row: { originalDescription: string; description: string; debit: number; credit: number }
): string | null {
  if (isCardPaymentRow(row)) return null
  return rules.get(ruleKey(directionOf(row), row.originalDescription)) ?? null
}

/** Rows of one direction: debits are OUT, credits IN */
const directionWhere = (direction: BankDirection) => (direction === 'OUT' ? { debit: { gt: 0 } } : { credit: { gt: 0 } })

export class BankCategoryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export interface SetBankCategoryResult {
  /** Rows whose category changed, this one included */
  updatedIds: string[]
}

/**
 * Sets a bank row's category. `scope: 'row'` sets only this row (a manual
 * choice, which rules never overwrite). `scope: 'rule'` saves "every row with
 * this description, same direction, at this provider's banks" and applies it
 * to this row and to the others nobody categorized by hand; future imports
 * apply it too. `category: null` clears (with 'rule', the rule is removed and
 * the rows it set are cleared).
 */
export async function setBankCategory(params: {
  id: string
  category: string | null
  scope: 'row' | 'rule'
}): Promise<SetBankCategoryResult> {
  const tx = await prisma.bankTransaction.findUnique({ where: { id: params.id }, include: { account: true } })
  if (!tx) throw new BankCategoryError('לא נמצא', 404)
  if (isCardPaymentRow(tx)) throw new BankCategoryError('לתשלום לחברת האשראי אין קטגוריה: הפירוט שלו בכרטיס', 400)

  if (params.scope === 'rule' && (await isGenericDescription(tx.originalDescription))) {
    throw new BankCategoryError('תיאור כללי: הקטגוריה נשמרת לתנועה זו בלבד', 400)
  }

  const direction = directionOf(tx)
  if (params.category !== null) {
    const cat = await prisma.category.findUnique({ where: { name: params.category } })
    if (!cat || cat.kind !== CATEGORY_KIND_OF[direction]) {
      throw new BankCategoryError(direction === 'OUT' ? 'קטגוריית הוצאה לא קיימת' : 'קטגוריית הכנסה לא קיימת', 400)
    }
  }

  if (params.scope === 'row') {
    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: { category: params.category, categoryManual: true },
    })
    return { updatedIds: [tx.id] }
  }

  const provider = tx.account.provider
  const ruleWhere = {
    provider_originalDescription_direction: { provider, originalDescription: tx.originalDescription, direction },
  }
  const rowsWhere = {
    originalDescription: tx.originalDescription,
    account: { provider, kind: 'BANK' as const },
    ...directionWhere(direction),
  }

  return prisma.$transaction(async db => {
    if (params.category === null) {
      await db.bankCategoryRule.deleteMany({ where: ruleWhere.provider_originalDescription_direction })
    } else {
      await db.bankCategoryRule.upsert({
        where: ruleWhere,
        update: { category: params.category },
        create: { ...ruleWhere.provider_originalDescription_direction, category: params.category },
      })
    }
    // This row follows the rule from now on, like the others it covers
    await db.bankTransaction.update({ where: { id: tx.id }, data: { categoryManual: false } })
    const affected = await db.bankTransaction.findMany({
      where: { ...rowsWhere, categoryManual: false },
      select: { id: true, description: true, originalDescription: true, debit: true },
    })
    // Same exclusion as on import: a card payment never takes a rule's category
    const ids = affected.filter(r => !isCardPaymentRow(r)).map(r => r.id)
    await db.bankTransaction.updateMany({ where: { id: { in: ids } }, data: { category: params.category } })
    return { updatedIds: ids }
  })
}

/**
 * Sets one category on several bank rows at once, each as a manual choice
 * (like `scope: 'row'`): for generic descriptions (cheques, transfers) a rule
 * can't tell the rows apart. All or nothing: one invalid row refuses the lot.
 */
export async function setBankCategoryMany(params: {
  ids: string[]
  category: string | null
}): Promise<SetBankCategoryResult> {
  const ids = [...new Set(params.ids)]
  return prisma.$transaction(async db => {
    const rows = await db.bankTransaction.findMany({
      where: { id: { in: ids } },
      select: { id: true, description: true, originalDescription: true, debit: true, credit: true },
    })
    if (rows.length !== ids.length) throw new BankCategoryError('לא נמצא', 404)
    if (rows.some(isCardPaymentRow)) {
      throw new BankCategoryError('לתשלום לחברת האשראי אין קטגוריה: הפירוט שלו בכרטיס', 400)
    }
    if (params.category !== null) {
      const cat = await db.category.findUnique({ where: { name: params.category } })
      const directions = new Set(rows.map(directionOf))
      for (const direction of directions) {
        if (!cat || cat.kind !== CATEGORY_KIND_OF[direction]) {
          throw new BankCategoryError(
            directions.size > 1
              ? 'נבחרו הוצאות והכנסות יחד: קטגוריה מתאימה רק לאחד מהכיוונים'
              : direction === 'OUT' ? 'קטגוריית הוצאה לא קיימת' : 'קטגוריית הכנסה לא קיימת',
            400
          )
        }
      }
    }
    await db.bankTransaction.updateMany({
      where: { id: { in: ids } },
      data: { category: params.category, categoryManual: true },
    })
    return { updatedIds: ids }
  })
}

const bankRowSelect = {
  date: true,
  description: true,
  originalDescription: true,
  debit: true,
  credit: true,
  category: true,
} as const

function yearWhere(year: number, month?: number) {
  return {
    gte: new Date(year, month ? month - 1 : 0, 1),
    lte: month ? new Date(year, month, 0, 23, 59, 59) : new Date(year, 12, 0, 23, 59, 59),
  }
}

/**
 * category -> month (1-12) -> total, for one direction of the bank rows of a
 * year. `cardPayments`: 'bucket' counts the card payment under its own name
 * (bank-only views), 'exclude' leaves it out (combined with the cards, whose
 * charges it pays).
 */
export async function getBankCategoryMonthly(
  accountId: AccountFilter,
  year: number,
  direction: BankDirection,
  opts: { cardPayments: 'bucket' | 'exclude' } = { cardPayments: 'bucket' }
): Promise<CategoryMonthly> {
  const rows = await prisma.bankTransaction.findMany({
    where: { ...accountWhere(accountId), ignored: false, date: yearWhere(year), ...directionWhere(direction) },
    select: bankRowSelect,
  })
  const result: CategoryMonthly = {}
  for (const row of rows) {
    const cat = bankRowCategory(row)
    if (cat === CARD_PAYMENT_CATEGORY && opts.cardPayments === 'exclude') continue
    const m = row.date.getMonth() + 1
    result[cat] ??= {}
    result[cat][m] = (result[cat][m] ?? 0) + (direction === 'OUT' ? row.debit : row.credit)
  }
  return result
}

/** category -> { total, count } for one direction over a year or one month (the donut); `filter` narrows to a merchant or search. */
export async function getBankCategoryStats(
  accountId: AccountFilter,
  year: number,
  month: number | undefined,
  direction: BankDirection,
  filter: NameFilter = {}
): Promise<Record<string, { total: number; count: number }>> {
  const rows = await prisma.bankTransaction.findMany({
    where: {
      ...accountWhere(accountId),
      ignored: false,
      date: yearWhere(year, month),
      description: nameMatch(filter),
      ...directionWhere(direction),
    },
    select: bankRowSelect,
  })
  const stats: Record<string, { total: number; count: number }> = {}
  for (const row of rows) {
    const cat = bankRowCategory(row)
    stats[cat] ??= { total: 0, count: 0 }
    stats[cat].total += direction === 'OUT' ? row.debit : row.credit
    stats[cat].count++
  }
  return stats
}
