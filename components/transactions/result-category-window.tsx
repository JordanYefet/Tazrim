'use client'

import { useState } from 'react'
import { CategoryPicker, CONTAINS_SCOPE, containsScope } from '@/components/categories/category-picker'
import { suggestKeyword } from '@/lib/insights/keyword-rules'
import { formatCurrency } from '@/lib/utils/currency'
import { toSearchParams, type SearchResult } from '@/lib/search/query'
import type { ResultScope } from './save-result-category'

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
 * tables open, with the merchant's year inside and a link to a search for the
 * merchant. The choice goes to `onSave`, which shows it at once and saves it
 * (save-result-category.ts); the window closes with it.
 */
export function ResultCategoryWindow({ result, picker, onClose, onSave }: {
  result: SearchResult | null
  picker: PickerData
  onClose: () => void
  /** The choice: `wide` is the merchant's other rows too (a bank rule, a card merchant), `contains` a text rule with `pattern` */
  onSave: (result: SearchResult, category: string | null, scope: ResultScope, pattern?: string) => void
}) {
  // The last result stays while the window animates out
  const [last, setLast] = useState<SearchResult | null>(result)
  if (result && result !== last) setLast(result)
  const r = result ?? last
  if (!r) return null
  const bank = r.source === 'bank'
  const income = r.amount < 0
  const original = r.originalDescription ?? r.description
  const generic = bank && picker.generic.includes(original)
  const names = income ? picker.income : picker.expense

  return (
    <CategoryPicker
      open={!!result}
      onOpenChange={o => !o && onClose()}
      context={`${bank ? (income ? 'תנועה נכנסת' : 'תנועה יוצאת') : 'חיוב'} · ${r.accountName} · ${displayDay(r.date)}`}
      title={r.description}
      detail={r.note}
      amount={formatCurrency(Math.abs(r.amount))}
      amountTone={income ? 'income' : 'expense'}
      categories={names.map(name => ({ name, color: picker.colors[name] }))}
      createKind={income ? 'INCOME' : 'EXPENSE'}
      current={r.category && (picker.expense.includes(r.category) || picker.income.includes(r.category)) ? r.category : null}
      allowNone={bank}
      merchantYear={{ source: r.source, id: r.id, year: Number(r.date.slice(0, 4)) }}
      merchantAll={{ href: `/search?${toSearchParams({ text: `"${r.description}"` })}` }}
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
      onSave={(category, scope, pattern) => {
        onClose()
        onSave(r, category, scope === CONTAINS_SCOPE ? 'contains' : scope === 'rule' || scope === 'merchant' ? 'wide' : 'row', pattern)
      }}
    />
  )
}
