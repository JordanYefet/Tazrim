import type { SearchResult } from '@/lib/search/query'

/** What a combined row's category window saves to: the row, the merchant's rows, or a contains-text rule */
export type ResultScope = 'row' | 'wide' | 'contains'

export type SaveOutcome =
  | {
      ok: true
      /** A contains-text rule's reach: the rows it changed, as `source:id` keys (the row's own save has none) */
      changed?: Set<string>
    }
  | { ok: false; error: string }

const FAILED = 'שמירת הקטגוריה נכשלה'

/**
 * Saves a combined row's (SearchResult) category through the row's own API, bank or
 * card. The caller shows the change first (hooks/use-optimistic-rows.ts) and reads
 * the outcome: on `ok` the save landed (with a text rule, the rows it reached), else
 * the error to show, and the rows go back.
 */
export async function saveResultCategory(r: SearchResult, category: string | null, scope: ResultScope, pattern?: string): Promise<SaveOutcome> {
  try {
    if (scope === 'contains') {
      const res = await fetch('/api/category-keyword-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, category, fromRow: { source: r.source, id: r.id } }),
      })
      if (!res.ok) return { ok: false, error: (await res.json().catch(() => null))?.error ?? FAILED }
      const { cardIds, bankIds } = (await res.json()) as { cardIds: string[]; bankIds: string[] }
      return { ok: true, changed: new Set([...cardIds.map(id => `card:${id}`), ...bankIds.map(id => `bank:${id}`)]) }
    }
    const wide = scope === 'wide'
    const res =
      r.source === 'bank'
        ? await fetch(`/api/bank/transactions/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, categoryScope: wide ? 'rule' : 'row' }),
          })
        : await fetch(`/api/cards/${encodeURIComponent(r.accountId)}/transactions/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryOverride: category, categoryScope: wide ? 'merchant' : 'row' }),
          })
    if (!res.ok) return { ok: false, error: (await res.json().catch(() => null))?.error ?? FAILED }
    return { ok: true }
  } catch {
    return { ok: false, error: FAILED }
  }
}
