import { listAccounts } from '@/lib/db/accounts'
import { listSearchCategories, searchTransactions } from '@/lib/db/search'
import { parseSearchParams, toSearchParams } from '@/lib/search/query'
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
  const [page, accounts, categories] = await Promise.all([
    searchTransactions(filters),
    listAccounts({ includeArchived: true }),
    listSearchCategories(),
  ])

  return (
    <SearchView
      filters={filters}
      queryString={toSearchParams(filters).toString()}
      page={page}
      accounts={accounts.map(a => ({ id: a.id, name: a.displayName, kind: a.kind }))}
      categories={categories}
    />
  )
}
