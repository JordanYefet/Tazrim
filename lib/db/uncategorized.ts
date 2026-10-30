import { prisma } from './client'
import { isCardPaymentRow } from '../insights/bank-categories'
import { buildBankWhere, buildCardWhere, type SearchFilters, type UncategorizedContext } from '../search/query'

// Transactions without a category: bank rows with none (except the card payment,
// which never takes one) and card rows whose category is none of yours (the issuer's
// own name, unmapped). Shared by search (uncategorized=1) and the overview's count.

/** Your category names and the bank's card-payment rows, for the uncategorized filter */
export async function uncategorizedContext(): Promise<UncategorizedContext> {
  const [categories, candidates] = await Promise.all([
    prisma.category.findMany({ select: { name: true } }),
    prisma.bankTransaction.findMany({
      where: { category: null, debit: { gt: 0 } },
      select: { id: true, description: true, originalDescription: true, debit: true },
    }),
  ])
  return {
    categories: categories.map(c => c.name),
    cardPaymentIds: candidates.filter(isCardPaymentRow).map(r => r.id),
  }
}

/** How many uncategorized bank and card rows (ignored ones left out); `accountIds` narrows to those accounts */
export async function countUncategorized(accountIds?: string[]): Promise<{ bank: number; card: number }> {
  const ctx = await uncategorizedContext()
  const filters: SearchFilters = { uncategorized: true, includeIgnored: false, limit: 0, ...(accountIds ? { accountIds } : {}) }
  const bankWhere = buildBankWhere(filters, undefined, ctx)
  const [bank, card] = await Promise.all([
    bankWhere ? prisma.bankTransaction.count({ where: bankWhere }) : 0,
    prisma.creditCardTransaction.count({ where: buildCardWhere(filters, undefined, ctx) }),
  ])
  return { bank, card }
}
