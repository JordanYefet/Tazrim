/**
 * What the overview's category insights cover (`?card=`): bank and cards
 * together (the default), the bank accounts, every card, or one card. The
 * bank side leaves out the card payment, whose breakdown the cards are.
 */
export type InsightsScope =
  | { kind: 'all' }
  | { kind: 'bank' }
  | { kind: 'cards' }
  | { kind: 'card'; id: string }

export function resolveInsightsScope(
  param: string | undefined,
  { bankIds, cardIds }: { bankIds: string[]; cardIds: string[] }
): InsightsScope {
  if (param === 'bank' && bankIds.length) return { kind: 'bank' }
  if (param === 'cards' && cardIds.length) return { kind: 'cards' }
  if (param && cardIds.includes(param)) return { kind: 'card', id: param }
  return { kind: 'all' }
}

/** The `?card=` value of a scope (none for the default) */
export function scopeParam(scope: InsightsScope): string | undefined {
  if (scope.kind === 'all') return undefined
  return scope.kind === 'card' ? scope.id : scope.kind
}

/** The bank and card accounts a scope reads */
export function scopeAccounts(scope: InsightsScope, { bankIds, cardIds }: { bankIds: string[]; cardIds: string[] }) {
  switch (scope.kind) {
    case 'all':
      return { bankIds, cardIds }
    case 'bank':
      return { bankIds, cardIds: [] }
    case 'cards':
      return { bankIds: [], cardIds }
    case 'card':
      return { bankIds: [], cardIds: [scope.id] }
  }
}

export interface ScopeOption {
  /** `?card=` value; undefined = all */
  value?: string
  label: string
}

/** The filter chips: only when there are two sources or more to tell apart. */
export function insightsScopeOptions({
  hasBank,
  cards,
}: {
  hasBank: boolean
  cards: { id: string; label: string }[]
}): ScopeOption[] {
  if ((hasBank ? 1 : 0) + cards.length < 2) return []
  // Without a bank, "all" is every card (as before bank categories)
  const options: ScopeOption[] = [{ value: undefined, label: hasBank ? 'הכל' : 'כל הכרטיסים' }]
  if (hasBank) options.push({ value: 'bank', label: 'בנק' })
  if (hasBank && cards.length > 1) options.push({ value: 'cards', label: 'כל הכרטיסים' })
  for (const c of cards) options.push({ value: c.id, label: c.label })
  return options
}
