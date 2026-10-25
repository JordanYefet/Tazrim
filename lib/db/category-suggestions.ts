import { prisma } from './client'
import {
  suggestCategories,
  wantsSuggestion,
  type CategorySuggestion,
  type SuggestionRow,
} from '../insights/category-suggestions'

/**
 * row id -> category suggestion (lib/insights/category-suggestions) for bank
 * rows about to be shown. One query loads the categorized history of only the
 * descriptions these rows have, from every account.
 */
export async function getCategorySuggestions(rows: SuggestionRow[]): Promise<Map<string, CategorySuggestion>> {
  const descriptions = [...new Set(rows.filter(wantsSuggestion).map(r => r.originalDescription))]
  if (descriptions.length === 0) return new Map()
  const candidates = await prisma.bankTransaction.findMany({
    where: { originalDescription: { in: descriptions }, category: { not: null }, ignored: false },
    select: {
      id: true,
      date: true,
      originalDescription: true,
      description: true,
      debit: true,
      credit: true,
      category: true,
      ignored: true,
    },
  })
  return suggestCategories(rows, candidates)
}

/** The rows, each with its `suggestion` when it has one (the table's shape, page and API alike) */
export async function withCategorySuggestions<T extends SuggestionRow>(
  rows: T[]
): Promise<(T & { suggestion?: CategorySuggestion })[]> {
  const suggestions = await getCategorySuggestions(rows)
  return rows.map(r => {
    const suggestion = suggestions.get(r.id)
    return suggestion ? { ...r, suggestion } : r
  })
}
