// What fills each category automatically (the categories page): an issuer's category
// mapped to it, a merchant rule that sets it, a bank rule for a description, or a
// contains-text rule.

export type CategorySource =
  | { type: 'issuer'; provider: string; sourceCategory: string; count: number }
  | { type: 'merchant'; provider: string; originalName: string; displayName: string }
  | { type: 'bank'; provider: string; originalDescription: string; direction: string }
  | { type: 'keyword'; id: string; pattern: string }

interface IssuerRow { provider: string; sourceCategory: string; count: number; category: string | null }
interface AliasRow { provider: string; originalName: string; displayName: string; categoryOverride: string | null }
interface BankRuleRow { provider: string; originalDescription: string; direction: string; category: string }
interface KeywordRuleRow { id: string; pattern: string; category: string }

/** category name -> its automatic sources, issuer mappings first, then merchants, bank rules, contains-text rules */
export function categorySources({ issuer, aliases, bankRules, keywordRules = [] }: {
  issuer: IssuerRow[]
  aliases: AliasRow[]
  bankRules: BankRuleRow[]
  keywordRules?: KeywordRuleRow[]
}): Record<string, CategorySource[]> {
  const out: Record<string, CategorySource[]> = {}
  const add = (category: string, source: CategorySource) => (out[category] ??= []).push(source)
  for (const r of issuer) {
    if (r.category) add(r.category, { type: 'issuer', provider: r.provider, sourceCategory: r.sourceCategory, count: r.count })
  }
  for (const a of aliases) {
    if (a.categoryOverride) {
      add(a.categoryOverride, { type: 'merchant', provider: a.provider, originalName: a.originalName, displayName: a.displayName })
    }
  }
  for (const r of bankRules) {
    add(r.category, { type: 'bank', provider: r.provider, originalDescription: r.originalDescription, direction: r.direction })
  }
  for (const r of keywordRules) add(r.category, { type: 'keyword', id: r.id, pattern: r.pattern })
  return out
}

/**
 * Issuer categories on the stored card rows that aren't one of yours yet: unmapped, and
 * not already named like one of your categories (their rows carry that name already).
 */
export function pendingIssuerCategories<T extends IssuerRow>(issuer: T[], yours: string[] = []): T[] {
  const names = new Set(yours)
  return issuer.filter(r => r.category === null && !names.has(r.sourceCategory))
}
