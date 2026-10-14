import { accountHref, accountPath, withQuery, type QueryInput } from './routes'

/** The category analysis page: one card's (`/cards/<id>/categories`) or every card's (`/cards/categories`). */
export function categoryAnalysisHref(cardId: string | undefined, params?: QueryInput): string {
  return withQuery(`${accountPath('CREDIT_CARD', cardId)}/categories`, params)
}

const pad = (n: number) => String(n).padStart(2, '0')

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
  const y = Number(year)
  const sp = new URLSearchParams()
  sp.set('from', month ? `${year}-${pad(month)}-01` : `${year}-01-01`)
  sp.set('to', month ? `${year}-${pad(month)}-${pad(new Date(y, month, 0).getDate())}` : `${year}-12-31`)
  for (const id of cardIds) sp.append('account', id)
  sp.set('category', category)
  return `/search?${sp}`
}
