/**
 * The overview's "list is the chart": the year's top categories as rows, the rest in "אחר".
 * Rows and their order come from the YEAR's ranking, so picking a month only changes the
 * amounts (and so the bar lengths), never which rows there are, their order or colours.
 */

export const OTHER_KEY = '__other__'

export interface CategoryBarRow {
  /** The category name, or OTHER_KEY for the rest */
  key: string
  label: string
  /** This period's spend in the row (the sum of the members for "אחר") */
  amount: number
  /** The categories folded into "אחר"; empty for a plain category row */
  members: string[]
  other: boolean
}

export interface CategoryBars {
  rows: CategoryBarRow[]
  /** The period's total across every row */
  total: number
  /** The largest row's amount: the bars are drawn relative to it */
  max: number
}

/**
 * @param ranked   every category, ranked by the year's spend (rankCategories)
 * @param amounts  the selected period's spend per category; absent means 0
 * @param limit    how many categories keep their own row (the rest fold into "אחר")
 */
export function groupCategoryBars(ranked: string[], amounts: Record<string, number>, limit = 6): CategoryBars {
  // A category the year ranking doesn't know (it can't happen for the same sources) goes to the end
  const known = new Set(ranked)
  const order = [...ranked, ...Object.keys(amounts).filter(c => !known.has(c))]
  const amountOf = (c: string) => Math.max(0, amounts[c] ?? 0)

  const head = order.slice(0, limit)
  const rest = order.slice(limit)
  const rows: CategoryBarRow[] = head.map(c => ({ key: c, label: c, amount: amountOf(c), members: [], other: false }))
  if (rest.length > 0) {
    rows.push({
      key: OTHER_KEY,
      label: `אחר (${rest.length})`,
      amount: rest.reduce((s, c) => s + amountOf(c), 0),
      members: rest,
      other: true,
    })
  }
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0)
  return { rows, total, max }
}
