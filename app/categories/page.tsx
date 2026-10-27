import { CategoriesView, type CategoryItem } from '@/components/categories/categories-view'
import { getCategories } from '@/lib/db/categories'
import { getAliases } from '@/lib/db/aliases'
import { getIssuerCategories } from '@/lib/db/category-mappings'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { getBankCategoryMonthly, listBankCategoryRules } from '@/lib/db/bank-categories'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { listAccounts } from '@/lib/db/accounts'
import { asJson } from '@/lib/db/summary'
import { mergeCategoryMonthly } from '@/lib/insights/bank-categories'
import { rankCategories, type CategoryMonthly } from '@/lib/insights/category-insights'
import { categorySources, pendingIssuerCategories } from '@/lib/insights/category-sources'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { withResolvedPeriod } from '@/lib/period-server'

const yearTotal = (monthly: CategoryMonthly, category: string) =>
  Object.values(monthly[category] ?? {}).reduce((s, v) => s + v, 0)

/**
 * One list of your categories (expense or income), each with its year's total and
 * chart colour; a category opens what fills it automatically.
 */
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const { year } = await withResolvedPeriod(await searchParams)
  const [banks, cards] = await Promise.all([listAccounts({ kind: 'BANK' }), listAccounts({ kind: 'CREDIT_CARD' })])
  const bankIds = banks.map(a => a.id)
  const cardIds = cards.map(a => a.id)

  const [expense, income, aliases, issuer, generic, bankRules, cardMonthly, outMonthly, inMonthly] = await Promise.all([
    getCategories('EXPENSE'),
    getCategories('INCOME'),
    getAliases(),
    getIssuerCategories(),
    listGenericDescriptions(),
    listBankCategoryRules(),
    cardIds.length ? getCCCategoryMonthly(cardIds, Number(year)) : {},
    // The card payment is left out: the card charges are its breakdown (as on the overview)
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'OUT', { cardPayments: 'exclude' }) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'IN') : {},
  ])

  const spent = mergeCategoryMonthly(cardMonthly, outMonthly)
  const sources = categorySources({ issuer, aliases, bankRules })
  const items = (list: { id: string; name: string }[], monthly: CategoryMonthly): CategoryItem[] => {
    const colors = categoryColorMap(rankCategories(monthly))
    return list.map(c => ({
      id: c.id,
      name: c.name,
      total: yearTotal(monthly, c.name),
      color: colors[c.name] ?? null,
      sources: sources[c.name] ?? [],
    }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">קטגוריות</h1>
      <CategoriesView
        expense={items(expense, spent)}
        income={items(income, inMonthly)}
        pending={pendingIssuerCategories(issuer)}
        issuer={issuer}
        generic={generic}
        aliases={asJson(aliases)}
        year={year}
      />
    </div>
  )
}
