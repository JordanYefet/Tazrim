import { accountHref, withQuery, type QueryInput } from './routes'
import { isRealCategory } from '@/lib/insights/bank-categories'

/**
 * The category analysis page (/analysis), bank and cards together. Its scope is in the
 * path: nothing = everything, `bank`, `cards`, or one account's id.
 */
export function analysisHref(scope: string | undefined, params?: QueryInput): string {
  return withQuery(scope ? `/analysis/${encodeURIComponent(scope)}` : '/analysis', params)
}

/** The analysis of one card, or of every card */
export function categoryAnalysisHref(cardId: string | undefined, params?: QueryInput): string {
  return analysisHref(cardId ?? 'cards', params)
}

/** The analysis of one bank account, or of every bank account */
export function bankCategoryAnalysisHref(accountId: string | undefined, params?: QueryInput): string {
  return analysisHref(accountId ?? 'bank', params)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Search params for these accounts over the period (bank rows by date, card rows by purchase date). */
function periodSearchParams(accountIds: string[], year: string, month?: number): URLSearchParams {
  const y = Number(year)
  const sp = new URLSearchParams()
  sp.set('from', month ? `${year}-${pad(month)}-01` : `${year}-01-01`)
  sp.set('to', month ? `${year}-${pad(month)}-${pad(new Date(y, month, 0).getDate())}` : `${year}-12-31`)
  for (const id of accountIds) sp.append('account', id)
  return sp
}

/** A search of these accounts for one category over the period. */
function categorySearchHref(accountIds: string[], category: string, year: string, month?: number): string {
  const sp = periodSearchParams(accountIds, year, month)
  sp.set('category', category)
  return `/search?${sp}`
}

/** A search of these accounts for the transactions without a category over the period. */
export function uncategorizedSearchHref({ accountIds, year, month }: { accountIds: string[]; year: string; month?: number }): string {
  const sp = periodSearchParams(accountIds, year, month)
  sp.set('uncategorized', '1')
  return `/search?${sp}`
}

/**
 * Where a category link goes: with one card, that card's page filtered to the
 * category (its transactions table); with several, a search of every card for
 * that category over the same period.
 */
export function categoryTransactionsHref({
  cardIds,
  category,
  year,
  month,
}: {
  cardIds: string[]
  category: string
  year: string
  month?: number
}): string {
  if (cardIds.length === 1) {
    return accountHref('CREDIT_CARD', cardIds[0], { year, ...(month ? { month: String(month) } : {}), category })
  }
  return categorySearchHref(cardIds, category, year, month)
}

/**
 * The bank side of categoryTransactionsHref: one account's page filtered to the
 * category (the uncategorized and card-payment buckets too), or a search of
 * several accounts, which only knows real categories (a bucket gets no link).
 */
export function bankCategoryTransactionsHref({
  accountIds,
  category,
  year,
  month,
}: {
  accountIds: string[]
  category: string
  year: string
  month?: number
}): string | undefined {
  if (accountIds.length === 1) {
    return accountHref('BANK', accountIds[0], { year, ...(month ? { month: String(month) } : {}), category })
  }
  return isRealCategory(category) ? categorySearchHref(accountIds, category, year, month) : undefined
}

/** Bank and card accounts together (the overview): a search of all of them, real categories only. */
export function combinedCategoryTransactionsHref({
  accountIds,
  category,
  year,
  month,
}: {
  accountIds: string[]
  category: string
  year: string
  month?: number
}): string | undefined {
  return isRealCategory(category) ? categorySearchHref(accountIds, category, year, month) : undefined
}
