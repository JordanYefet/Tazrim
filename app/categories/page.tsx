import { CategoriesView, type CategoryItem } from '@/components/categories/categories-view'
import { getCategories } from '@/lib/db/categories'
import { getAliases } from '@/lib/db/aliases'
import { getIssuerCategories } from '@/lib/db/category-mappings'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { getBankCategoryMonthly, listBankCategoryRules } from '@/lib/db/bank-categories'
import { listBankDescriptions, listCardMerchants } from '@/lib/db/category-choices'
import { listKeywordRules } from '@/lib/db/keyword-rules'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { listAccounts } from '@/lib/db/accounts'
import { asJson } from '@/lib/db/summary'
import { mergeCategoryMonthly } from '@/lib/insights/bank-categories'
import { rankCategories, type CategoryMonthly } from '@/lib/insights/category-insights'
import { categorySources, pendingIssuerCategories } from '@/lib/insights/category-sources'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { withResolvedPeriod } from '@/lib/period-server'

/**
 * One list of your categories (expense or income), each in its chart colour (ranked by
 * the selected year's spending, as on the charts); a category opens what fills it automatically.
 */
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const { year } = await withResolvedPeriod(await searchParams)
  const [banks, cards] = await Promise.all([listAccounts({ kind: 'BANK' }), listAccounts({ kind: 'CREDIT_CARD' })])
  const bankIds = banks.map(a => a.id)
  const cardIds = cards.map(a => a.id)

  const [expense, income, aliases, issuer, generic, bankRules, keywordRules, cardMonthly, outMonthly, inMonthly, merchants, outDescriptions, inDescriptions] = await Promise.all([
    getCategories('EXPENSE'),
    getCategories('INCOME'),
    getAliases(),
    getIssuerCategories(),
    listGenericDescriptions(),
    listBankCategoryRules(),
    listKeywordRules(),
    cardIds.length ? getCCCategoryMonthly(cardIds, Number(year)) : {},
    // The card payment is left out: the card charges are its breakdown (as on the overview)
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'OUT', { cardPayments: 'exclude' }) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'IN') : {},
    listCardMerchants(),
    listBankDescriptions('OUT'),
    listBankDescriptions('IN'),
  ])

  const spent = mergeCategoryMonthly(cardMonthly, outMonthly)
  const sources = categorySources({ issuer, aliases, bankRules, keywordRules })
  const items = (list: { id: string; name: string }[], monthly: CategoryMonthly): CategoryItem[] => {
    const colors = categoryColorMap(rankCategories(monthly))
    return list.map(c => ({
      id: c.id,
      name: c.name,
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
        pending={pendingIssuerCategories(issuer, [...expense, ...income].map(c => c.name))}
        choices={{ issuer, merchants, descriptions: { OUT: outDescriptions, IN: inDescriptions } }}
        generic={generic}
        aliases={asJson(aliases)}
      />
    </div>
  )
}
