/**
 * Categories of bank rows. Debits take expense categories (the same ones
 * cards use), credits take income ones. Two buckets are not real categories:
 * the monthly card payment (its breakdown is the card's own categories, so the
 * combined view leaves it out) and rows nobody has categorized yet.
 */
import { isCardPaymentDescription } from './card-payment'
import type { CategoryMonthly } from './category-insights'

export const UNCATEGORIZED = 'ללא קטגוריה'
export const CARD_PAYMENT_CATEGORY = 'תשלום כרטיס אשראי'

/** OUT = a debit (expense), IN = a credit (income) */
export type BankDirection = 'OUT' | 'IN'

export const CATEGORY_KIND_OF: Record<BankDirection, 'EXPENSE' | 'INCOME'> = { OUT: 'EXPENSE', IN: 'INCOME' }

interface BankRowLike {
  originalDescription: string
  description: string
  debit: number
  credit: number
  category: string | null
}

export function directionOf(row: Pick<BankRowLike, 'debit'>): BankDirection {
  return row.debit > 0 ? 'OUT' : 'IN'
}

/** The bank's payment to a card company: it never takes a category of its own */
export function isCardPaymentRow(row: Pick<BankRowLike, 'originalDescription' | 'description' | 'debit'>): boolean {
  return row.debit > 0 && (isCardPaymentDescription(row.originalDescription) || isCardPaymentDescription(row.description))
}

/** The bucket a row counts under: its category, the card-payment bucket, or uncategorized. */
export function bankRowCategory(row: BankRowLike): string {
  if (isCardPaymentRow(row)) return CARD_PAYMENT_CATEGORY
  return row.category ?? UNCATEGORIZED
}

/** A real category a user can filter a search by (not one of the two buckets). */
export function isRealCategory(name: string): boolean {
  return name !== UNCATEGORIZED && name !== CARD_PAYMENT_CATEGORY
}

/** Sums category -> month amounts of several sources (cards and bank, say). */
export function mergeCategoryMonthly(...parts: CategoryMonthly[]): CategoryMonthly {
  const out: CategoryMonthly = {}
  for (const part of parts) {
    for (const [cat, byMonth] of Object.entries(part)) {
      out[cat] ??= {}
      for (const [m, v] of Object.entries(byMonth)) out[cat][Number(m)] = (out[cat][Number(m)] ?? 0) + v
    }
  }
  return out
}

/** The `?flow=` filter of the bank pages: `in` = income only, `out` = expenses only, none = both */
export function parseBankFlow(value: string | null | undefined): BankDirection | undefined {
  return value === 'in' ? 'IN' : value === 'out' ? 'OUT' : undefined
}
