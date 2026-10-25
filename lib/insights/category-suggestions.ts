/**
 * A category to suggest for an uncategorized bank row. Generic descriptions
 * (cheques, transfers) can't take a rule: the same text goes to different
 * payees. But a row with the same text and nearly the same amount (a premium
 * that drifts a little each month) most likely went to the same payee, so its
 * category is offered. Never applied without the user's click.
 */
import { directionOf, isCardPaymentRow } from './bank-categories'

/** How far a past row's amount may be from the row's own, as a share of it */
export const SUGGESTION_TOLERANCE = 0.05

export interface SuggestionRow {
  id: string
  date: Date
  originalDescription: string
  description: string
  debit: number
  credit: number
  category: string | null
  ignored: boolean
}

export interface CategorySuggestion {
  category: string
  /** The amount and date of the row the category comes from (the "why") */
  fromAmount: number
  fromDate: Date
}

const amountOf = (row: Pick<SuggestionRow, 'debit' | 'credit'>) => (row.debit > 0 ? row.debit : row.credit)
const keyOf = (row: SuggestionRow) => `${directionOf(row)}|${row.originalDescription}`

/** Rows a suggestion is for: uncategorized, shown, and not the card payment */
export function wantsSuggestion(row: SuggestionRow): boolean {
  return row.category === null && !row.ignored && !isCardPaymentRow(row)
}

function pick(target: SuggestionRow, candidates: SuggestionRow[]): CategorySuggestion | null {
  const amount = amountOf(target)
  // A hair of slack, so an amount exactly at the edge isn't lost to float error
  const limit = SUGGESTION_TOLERANCE * amount + 1e-9
  let best: SuggestionRow | null = null
  let bestGap = Infinity
  for (const c of candidates) {
    if (c.id === target.id || c.category === null || c.ignored) continue
    const gap = Math.abs(amountOf(c) - amount)
    if (gap > limit) continue
    if (gap < bestGap || (gap === bestGap && best && c.date > best.date)) {
      best = c
      bestGap = gap
    }
  }
  return best ? { category: best.category!, fromAmount: amountOf(best), fromDate: best.date } : null
}

/** One row's suggestion from `candidates` (rows of any account), or null */
export function suggestCategory(target: SuggestionRow, candidates: SuggestionRow[]): CategorySuggestion | null {
  if (!wantsSuggestion(target)) return null
  const key = keyOf(target)
  return pick(target, candidates.filter(c => keyOf(c) === key))
}

/** row id -> suggestion, for the rows that have one */
export function suggestCategories(targets: SuggestionRow[], candidates: SuggestionRow[]): Map<string, CategorySuggestion> {
  // Grouped once, so each target only scans the rows of its own description
  const byKey = new Map<string, SuggestionRow[]>()
  for (const c of candidates) {
    const key = keyOf(c)
    const group = byKey.get(key)
    if (group) group.push(c)
    else byKey.set(key, [c])
  }
  const out = new Map<string, CategorySuggestion>()
  for (const t of targets) {
    if (!wantsSuggestion(t)) continue
    const s = pick(t, byKey.get(keyOf(t)) ?? [])
    if (s) out.set(t.id, s)
  }
  return out
}
