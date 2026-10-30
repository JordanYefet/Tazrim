import { listAccounts } from '@/lib/db/accounts'
import { listSearchCategories, searchTransactions } from '@/lib/db/search'
import { getCategories } from '@/lib/db/categories'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { getBankCategoryMonthly } from '@/lib/db/bank-categories'
import { mergeCategoryMonthly } from '@/lib/insights/bank-categories'
import { rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { parseSearchParams, toSearchParams } from '@/lib/search/query'
import { withResolvedPeriod } from '@/lib/period-server'
import { SearchView } from '@/components/search/search-view'

export const metadata = { title: 'חיפוש · תזרים' }

/** Search every transaction; all filters live in the URL so a search is linkable. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseSearchParams(await searchParams)
  // The page always starts from the first page; "load more" continues through the API
  delete filters.cursor
  // A result's category opens the category window: its lists, colours (ranked as on the
  // overview, by the remembered period's year) and the descriptions saved row by row
  const { year } = await withResolvedPeriod({})
  const [page, accounts, categories, expense, income, generic] = await Promise.all([
    searchTransactions(filters),
    listAccounts({ includeArchived: true }),
    listSearchCategories(),
    getCategories('EXPENSE'),
    getCategories('INCOME'),
    listGenericDescriptions(),
  ])
  const bankIds = accounts.filter(a => a.kind === 'BANK').map(a => a.id)
  const cardIds = accounts.filter(a => a.kind === 'CREDIT_CARD').map(a => a.id)
  const [cardMonthly, outMonthly, inMonthly] = await Promise.all([
    cardIds.length ? getCCCategoryMonthly(cardIds, Number(year)) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'OUT', { cardPayments: 'exclude' }) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'IN') : {},
  ])
  const colors = {
    ...categoryColorMap(rankCategories(inMonthly)),
    ...categoryColorMap(rankCategories(mergeCategoryMonthly(cardMonthly, outMonthly))),
  }

  return (
    <SearchView
      filters={filters}
      queryString={toSearchParams(filters).toString()}
      page={page}
      accounts={accounts.map(a => ({ id: a.id, name: a.displayName, kind: a.kind }))}
      categories={categories}
      picker={{
        expense: expense.map(c => c.name),
        income: income.map(c => c.name),
        colors,
        generic,
      }}
    />
  )
}
