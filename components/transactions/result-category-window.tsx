'use client'

import { useState } from 'react'
import { CategoryPicker, CONTAINS_SCOPE, containsScope } from '@/components/categories/category-picker'
import { suggestKeyword } from '@/lib/insights/keyword-rules'
import { formatCurrency } from '@/lib/utils/currency'
import type { SearchResult } from '@/lib/search/query'

/** What a combined row's category window needs (the search page, a category's year) */
export interface PickerData {
  /** Category names by kind: card charges and bank debits take expense ones, bank credits income ones */
  expense: string[]
  income: string[]
  /** Each category's chart colour */
  colors: Record<string, string>
  /** Bank descriptions categorised row by row, never by a rule */
  generic: string[]
}

/** DD.MM.YYYY from the result's YYYY-MM-DD key */
const displayDay = (key: string) => key.split('-').reverse().join('.')

/**
 * A combined row's (SearchResult) category window: the same one the bank and card
 * tables open, saving through the row's own API, with the merchant's year inside.
 */
export function ResultCategoryWindow({ result, picker, onClose, onApplied }: {
  result: SearchResult | null
  picker: PickerData
  onClose: () => void
  /** `wide`: the choice reached the merchant's other rows; `changed`: the rows a contains-text rule changed, as `source:id` keys */
  onApplied: (result: SearchResult, category: string | null, wide: boolean, changed?: Set<string>) => void
}) {
  // The last result stays while the window animates out
  const [last, setLast] = useState<SearchResult | null>(result)
  if (result && result !== last) setLast(result)
  const r = result ?? last
  const [error, setError] = useState<string | null>(null)
  if (!r) return null
  const bank = r.source === 'bank'
  const income = r.amount < 0
  const original = r.originalDescription ?? r.description
  const generic = bank && picker.generic.includes(original)
  const names = income ? picker.income : picker.expense

  async function save(category: string | null, scope: string | null, pattern?: string) {
    if (!r) return
    if (scope === CONTAINS_SCOPE) {
      const res = await fetch('/api/category-keyword-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, category, fromRow: { source: r.source, id: r.id } }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'שמירת הקטגוריה נכשלה')
        return
      }
      setError(null)
      onClose()
      const { cardIds, bankIds } = (await res.json()) as { cardIds: string[]; bankIds: string[] }
      onApplied(r, category, true, new Set([...cardIds.map(id => `card:${id}`), ...bankIds.map(id => `bank:${id}`)]))
      return
    }
    const wide = scope === 'rule' || scope === 'merchant'
    const res = bank
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
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? 'שמירת הקטגוריה נכשלה')
      return
    }
    setError(null)
    onClose()
    onApplied(r, category, wide)
  }

  return (
    <>
      <CategoryPicker
        open={!!result}
        onOpenChange={o => !o && onClose()}
        context={`${bank ? (income ? 'תנועה נכנסת' : 'תנועה יוצאת') : 'חיוב'} · ${r.accountName} · ${displayDay(r.date)}`}
        title={r.description}
        amount={formatCurrency(Math.abs(r.amount))}
        amountTone={income ? 'income' : 'expense'}
        categories={names.map(name => ({ name, color: picker.colors[name] }))}
        createKind={income ? 'INCOME' : 'EXPENSE'}
        current={r.category && (picker.expense.includes(r.category) || picker.income.includes(r.category)) ? r.category : null}
        allowNone={bank}
        merchantYear={{ source: r.source, id: r.id, year: Number(r.date.slice(0, 4)) }}
        scopes={
          generic
            ? undefined
            : bank
              ? [
                  { id: 'row', title: 'רק התנועה הזאת', sub: 'שאר התנועות עם התיאור הזה לא משתנות' },
                  { id: 'rule', title: `כל התנועות ${income ? 'הנכנסות' : 'היוצאות'} "${original}"`, sub: 'כולל תנועות שיועלו בהמשך; תנועה שבחרת לה ידנית לא משתנה' },
                  containsScope(original, income ? 'INCOME' : 'EXPENSE', suggestKeyword(original)),
                ]
              : [
                  { id: 'row', title: 'רק החיוב הזה', sub: `שאר החיובים מ${r.description} לא משתנים` },
                  { id: 'merchant', title: `כל החיובים מ${r.description}`, sub: 'בכל הכרטיסים של החברה, וגם בקבצים הבאים' },
                  containsScope(original, 'EXPENSE', suggestKeyword(original)),
                ]
        }
        note={generic ? `"${original}" הוא תיאור כללי: הקטגוריה נשמרת לתנועה הזאת בלבד.` : undefined}
        onSave={save}
      />
      {error && <p role="alert" className="px-2 pt-2 text-sm text-destructive">{error}</p>}
    </>
  )
}
