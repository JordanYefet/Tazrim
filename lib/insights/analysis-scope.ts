// The category analysis page's scope (/analysis/<scope>): everything, the bank, the
// cards, or one account. Bank and cards share categories, so the default is both.

interface Named { id: string; label: string }

export interface AnalysisScope {
  /** The path segment ('' = everything) */
  value: string
  bankIds: string[]
  cardIds: string[]
}

export interface AnalysisScopeOption {
  value: string
  label: string
}

/** The scope a path segment names; anything unknown is everything */
export function resolveAnalysisScope(param: string | undefined, { banks, cards }: { banks: Named[]; cards: Named[] }): AnalysisScope {
  const bankIds = banks.map(b => b.id)
  const cardIds = cards.map(c => c.id)
  if (param === 'bank' && bankIds.length) return { value: 'bank', bankIds, cardIds: [] }
  if (param === 'cards' && cardIds.length) return { value: 'cards', bankIds: [], cardIds }
  if (param && bankIds.includes(param)) return { value: param, bankIds: [param], cardIds: [] }
  if (param && cardIds.includes(param)) return { value: param, bankIds: [], cardIds: [param] }
  return { value: '', bankIds, cardIds }
}

/**
 * The chips: everything, then the bank (and each account when there are several),
 * then the cards (and each card when there are several). Fewer than two accounts: none.
 */
export function analysisScopeOptions({ banks, cards }: { banks: Named[]; cards: Named[] }): AnalysisScopeOption[] {
  if (banks.length + cards.length < 2) return []
  const options: AnalysisScopeOption[] = [{ value: '', label: 'הכל' }]
  if (banks.length && cards.length) options.push({ value: 'bank', label: banks.length > 1 ? 'כל הבנקים' : banks[0].label })
  if (banks.length > 1) options.push(...banks.map(b => ({ value: b.id, label: b.label })))
  if (cards.length && banks.length) options.push({ value: 'cards', label: cards.length > 1 ? 'כל הכרטיסים' : cards[0].label })
  if (cards.length > 1) options.push(...cards.map(c => ({ value: c.id, label: c.label })))
  return options
}
