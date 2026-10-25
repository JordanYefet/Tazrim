'use client'

import { useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { X, EyeOff, Eye } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { UnusualBadge } from '@/components/insights/unusual-badge'
import type { UnusualFlag } from '@/lib/insights/unusual'
import { accountPath } from '@/lib/accounts/routes'
import { MarkRecurringButton } from '@/components/recurring/mark-recurring'
import type { RowSeries } from '@/lib/insights/recurring-overrides'
import { CARD_PAYMENT_CATEGORY, UNCATEGORIZED, directionOf, isCardPaymentRow } from '@/lib/insights/bank-categories'
import { ColumnPicker } from '@/components/ui/column-picker'
import { BANK_COLUMNS, type BankColumn } from '@/lib/tables/columns'

const LABEL = Object.fromEntries(BANK_COLUMNS.map(c => [c.key, c.label])) as Record<BankColumn, string>

interface BankTx {
  id: string
  date: string
  originalDescription: string
  description: string
  debit: number
  credit: number
  balance: number
  note: string
  reference?: string
  category: string | null
  categoryManual: boolean
  ignored: boolean
}

interface Category { id: string; name: string }

/** A category picked on a row, waiting for "this row" or "every such row" */
interface PendingCategory { id: string; category: string | null }

export function BankTransactionsTable({
  accountId,
  transactions: initial,
  showIgnored,
  hasMore: initialHasMore,
  fetchParams,
  unusual = {},
  recurring = {},
  initialColumns = [],
  expenseCategories = [],
  incomeCategories = [],
  activeCategory,
  flowFilter,
  genericDescriptions = [],
}: {
  /** The bank account these rows belong to */
  accountId: string
  transactions: BankTx[]
  /** Picked from on debits */
  expenseCategories?: Category[]
  /** Picked from on credits */
  incomeCategories?: Category[]
  /** The `?category=` filter in effect */
  activeCategory?: string
  /** The page's all / income / expenses switch, at the start of the toolbar */
  flowFilter?: ReactNode
  showIgnored?: boolean
  hasMore?: boolean
  fetchParams?: string
  /** Unusual-transaction flags by transaction id */
  unusual?: Record<string, UnusualFlag[]>
  /** The recurring series each transaction is in, by id (ENG-71) */
  recurring?: Record<string, RowSeries>
  /** Optional columns to show (the page reads the cookie, lib/tables/columns.ts) */
  initialColumns?: string[]
  /** Descriptions categorised row by row, never by a rule (lib/db/generic-descriptions.ts) */
  genericDescriptions?: string[]
}) {
  const [columns, setColumns] = useState(initialColumns as BankColumn[])
  const router = useRouter()
  const params = useSearchParams()
  const [transactions, setTransactions] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<{ id: string; field: 'note'; value: string } | null>(null)
  const [pending, setPending] = useState<PendingCategory | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [generic, setGeneric] = useState(() => new Set(genericDescriptions))
  const activeMerchant = params.get('merchant')
  const pagePath = accountPath('BANK', accountId)

  async function loadMore() {
    if (!fetchParams) return
    setLoadingMore(true)
    const res = await fetch(`/api/bank/transactions?${fetchParams}&accountId=${encodeURIComponent(accountId)}&skip=${transactions.length}`)
    const more: BankTx[] = await res.json()
    setTransactions(prev => [...prev, ...more])
    setHasMore(more.length === 50)
    setLoadingMore(false)
  }

  async function saveEdit() {
    if (!editing) return
    await fetch(`/api/bank/transactions/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [editing.field]: editing.value }),
    })
    setTransactions(prev =>
      prev.map(t => t.id === editing.id ? { ...t, [editing.field]: editing.value } : t)
    )
    setEditing(null)
  }

  async function saveCategory(scope: 'row' | 'rule', target = pending) {
    if (!target) return
    const { id, category } = target
    const res = await fetch(`/api/bank/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, categoryScope: scope }),
    })
    setPending(null)
    if (!res.ok) {
      setCategoryError((await res.json().catch(() => null))?.error ?? 'שמירת הקטגוריה נכשלה')
      return
    }
    setCategoryError(null)
    // The rule also covers rows of this description on other pages and accounts; these are the loaded ones
    const { updatedIds } = (await res.json()) as { updatedIds: string[] }
    const changed = new Set(updatedIds)
    setTransactions(prev =>
      prev.map(t =>
        changed.has(t.id) ? { ...t, category, categoryManual: scope === 'row' && t.id === id } : t
      )
    )
  }

  // A generic description has no rule to offer, so a pick saves the row right away
  function pickCategory(tx: BankTx, category: string | null) {
    if (generic.has(tx.originalDescription)) saveCategory('row', { id: tx.id, category })
    else setPending({ id: tx.id, category })
  }

  /** Marks the pending row's description generic (its rules go), then saves the pick for that row */
  async function markGeneric() {
    const tx = pending && transactions.find(t => t.id === pending.id)
    if (!tx) return
    const res = await fetch('/api/bank/generic-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: tx.originalDescription }),
    })
    if (!res.ok) {
      setPending(null)
      setCategoryError((await res.json().catch(() => null))?.error ?? 'הסימון נכשל')
      return
    }
    const cleared = new Set((await res.json()).clearedIds as string[])
    setGeneric(prev => new Set(prev).add(tx.originalDescription))
    setTransactions(prev => prev.map(t => (cleared.has(t.id) ? { ...t, category: null } : t)))
    await saveCategory('row')
    // The totals and donuts counted the cleared rule categories
    router.refresh()
  }

  async function toggleIgnored(tx: BankTx) {
    const ignored = !tx.ignored
    await fetch(`/api/bank/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignored }),
    })
    if (showIgnored) {
      setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, ignored } : t))
    } else {
      setTransactions(prev => prev.filter(t => t.id !== tx.id))
    }
  }

  function filterMerchant(description: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('merchant', description)
    router.push(`${pagePath}?${sp.toString()}`, { scroll: false })
  }

  function clearMerchant() {
    const sp = new URLSearchParams(params.toString())
    sp.delete('merchant')
    router.push(`${pagePath}?${sp.toString()}`, { scroll: false })
  }

  function clearCategory() {
    const sp = new URLSearchParams(params.toString())
    sp.delete('category')
    router.push(`${pagePath}?${sp.toString()}`, { scroll: false })
  }

  function toggleShowIgnored() {
    const sp = new URLSearchParams(params.toString())
    if (showIgnored) {
      sp.delete('showIgnored')
    } else {
      sp.set('showIgnored', 'true')
    }
    router.push(`${pagePath}?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {flowFilter}
          {(activeMerchant || activeCategory) && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-muted-foreground text-xs">מסנן:</span>
              {activeMerchant && (
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                  {activeMerchant}
                  <button onClick={clearMerchant} aria-label="הסר מסנן" className="hover:text-primary/70 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeCategory && (
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                  {activeCategory}
                  <button onClick={clearCategory} aria-label="הסר מסנן קטגוריה" className="hover:text-primary/70 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ColumnPicker kind="bank" shown={columns} onChange={next => setColumns(next as BankColumn[])} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!showIgnored}
              onChange={toggleShowIgnored}
              className="accent-primary w-3.5 h-3.5"
            />
            הצג מוסתרים
          </label>
        </div>
      </div>

      {categoryError && <p role="alert" className="text-sm text-destructive">{categoryError}</p>}

      {/* Table */}
      <div className="rounded-xl surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['תאריך', 'תיאור', 'קטגוריה', 'חובה', 'זכות', 'יתרה', 'הערה', ...columns.map(c => LABEL[c]), ''].map((h, i) => (
                  <th key={i} className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr
                  key={tx.id}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/30',
                    tx.ignored && 'opacity-40'
                  )}
                >
                  <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs">{formatDate(tx.date)}</td>
                  <td className="py-2.5 px-4 min-w-[140px]">
                    {tx.ignored ? (
                      <span className="line-through text-muted-foreground">{tx.description}</span>
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary transition-colors"
                        onClick={() => filterMerchant(tx.description)}
                      >
                        {tx.description}
                      </span>
                    )}
                    {!tx.ignored && unusual[tx.id]?.map(f => (
                      <UnusualBadge key={f.reason} flag={f} className="ms-1.5 align-middle" />
                    ))}
                    {/* Manual recurring series: its name as a label that opens the sheet (ENG-71).
                        Phones get the mark action here too, so it needs no sideways scroll. */}
                    {!tx.ignored && recurring[tx.id]?.manual ? (
                      <MarkRecurringButton variant="label" source="bank" transactionId={tx.id} seriesName={recurring[tx.id].name} className="ms-1.5" />
                    ) : (
                      !tx.ignored && tx.debit > 0 && (
                        <MarkRecurringButton source="bank" transactionId={tx.id} seriesName={recurring[tx.id]?.name} className="ms-1 align-middle sm:hidden" />
                      )
                    )}
                  </td>
                  <td className="py-2.5 px-4 min-w-[140px] align-top">
                    <CategoryCell
                      tx={tx}
                      categories={directionOf(tx) === 'OUT' ? expenseCategories : incomeCategories}
                      pending={pending?.id === tx.id ? pending : null}
                      generic={generic.has(tx.originalDescription)}
                      onPick={category => pickCategory(tx, category)}
                      onSave={scope => saveCategory(scope)}
                      onMarkGeneric={markGeneric}
                      onCancel={() => setPending(null)}
                    />
                  </td>
                  <td className="py-2.5 px-4 text-[hsl(var(--expense))] font-medium tabular-nums">
                    {tx.debit > 0 ? formatCurrency(tx.debit) : ''}
                  </td>
                  <td className="py-2.5 px-4 text-[hsl(var(--income))] font-medium tabular-nums">
                    {tx.credit > 0 ? formatCurrency(tx.credit) : ''}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground tabular-nums">{formatCurrency(tx.balance)}</td>
                  <td className="py-2.5 px-4 min-w-[120px]">
                    {editing?.id === tx.id && editing.field === 'note' ? (
                      <input
                        autoFocus
                        className="w-full border rounded-md px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        value={editing.value}
                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                        onBlur={saveEdit}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer text-muted-foreground hover:text-primary transition-colors text-xs"
                        onClick={() => setEditing({ id: tx.id, field: 'note', value: tx.note })}
                      >
                        {tx.note || '+ הוסף הערה'}
                      </span>
                    )}
                  </td>
                  {columns.includes('reference') && (
                    <td className={cn('py-2.5 px-4 whitespace-nowrap text-xs text-muted-foreground tabular-nums', tx.ignored && 'line-through')}>
                      {tx.reference && <span dir="ltr">{tx.reference}</span>}
                    </td>
                  )}
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {/* Mark as recurring (ENG-71): expenses only. Other rows keep its place empty,
                        so the hide button sits in the same spot on every row */}
                    {!tx.ignored && tx.debit > 0 ? (
                      <MarkRecurringButton source="bank" transactionId={tx.id} seriesName={recurring[tx.id]?.name} className="me-0.5 align-middle max-sm:hidden" />
                    ) : (
                      <span aria-hidden className="me-0.5 inline-block h-7 w-7 align-middle max-sm:hidden" />
                    )}
                    <button
                      onClick={() => toggleIgnored(tx)}
                      aria-label={tx.ignored ? 'בטל התעלמות' : 'התעלם מעסקה'}
                      className="p-1 rounded-md hover:bg-muted transition-colors align-middle"
                    >
                      {tx.ignored
                        ? <Eye className="h-3.5 w-3.5 text-primary" />
                        : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <p className="text-center py-10 text-muted-foreground text-sm">אין עסקאות לתקופה זו</p>
          )}
        </div>
      </div>

      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
          >
            {loadingMore ? 'טוען...' : 'טען עוד'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * A row's category: a picker of the row's kind (expense for debits, income
 * for credits), then a choice of this row only or every row with the same
 * description in the same direction (a rule, also applied to future imports).
 * A generic description (a cheque, a transfer) has no rule: a pick saves this row.
 * The card payment has none: its breakdown is the card's own categories.
 */
function CategoryCell({
  tx,
  categories,
  pending,
  generic,
  onPick,
  onSave,
  onMarkGeneric,
  onCancel,
}: {
  tx: BankTx
  categories: Category[]
  pending: PendingCategory | null
  generic: boolean
  onPick: (category: string | null) => void
  onSave: (scope: 'row' | 'rule') => void
  onMarkGeneric: () => void
  onCancel: () => void
}) {
  if (isCardPaymentRow(tx)) {
    return <span className="text-xs text-muted-foreground" title="הפירוט לפי קטגוריה נמצא בכרטיס">{CARD_PAYMENT_CATEGORY}</span>
  }
  if (tx.ignored) {
    return <span className="line-through text-muted-foreground text-xs">{tx.category ?? ''}</span>
  }
  const value = pending ? pending.category : tx.category
  // A category the list no longer has (renamed or deleted) still shows
  const missing = tx.category && !categories.some(c => c.name === tx.category)
  const direction = directionOf(tx) === 'OUT' ? 'היוצאות' : 'הנכנסות'
  return (
    <div className="space-y-1.5">
      <select
        // one width for every row, so the column lines up (a long name is cut by the select)
        className={cn('w-36 text-xs', !value && 'text-muted-foreground')}
        value={value ?? ''}
        aria-label="קטגוריה"
        onChange={e => onPick(e.target.value || null)}
      >
        <option value="">{UNCATEGORIZED}</option>
        {missing && <option value={tx.category!}>{tx.category}</option>}
        {categories.map(c => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
      {generic && <p className="text-[11px] text-muted-foreground">תיאור כללי · נשמר לתנועה זו בלבד</p>}
      {pending && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button
            onClick={() => onSave('row')}
            className="rounded-md border px-2 py-0.5 hover:bg-muted transition-colors"
          >
            רק תנועה זו
          </button>
          <button
            onClick={() => onSave('rule')}
            className="max-w-[16rem] truncate rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20 transition-colors"
            title="גם לתנועות שיועלו בהמשך"
          >
            כל התנועות {direction} <bdi>{tx.originalDescription}</bdi>
          </button>
          <button onClick={onCancel} aria-label="ביטול" className="p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={onMarkGeneric}
            className="basis-full text-start text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            title="תיאור שלא מזהה למי הכסף הלך, כמו שיק או העברה: כל תנועה שלו מקבלת קטגוריה משלה"
          >
            סמן כתיאור כללי
          </button>
        </div>
      )}
    </div>
  )
}
