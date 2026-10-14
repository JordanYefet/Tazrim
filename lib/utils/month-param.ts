/**
 * The query string after clicking `month` in a chart: selects it, or, when it
 * is already the selected month, clears it so the page goes back to all months.
 * Every other param (year, card filter, ...) is kept.
 */
export function toggleMonthQuery(query: string | URLSearchParams, month: number): string {
  const sp = new URLSearchParams(query)
  if (sp.get('month') === String(month)) sp.delete('month')
  else sp.set('month', String(month))
  return sp.toString()
}

/** `path?query`, or just `path` when the query is empty. */
export function withQueryString(path: string, query: string): string {
  return query ? `${path}?${query}` : path
}
