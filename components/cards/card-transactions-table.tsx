'use client'

import { useState } from 'react'
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
import { ColumnPicker } from '@/components/ui/column-picker'
import { CARD_COLUMNS, type CardColumn } from '@/lib/tables/columns'
import { CategoryPicker, CategoryPill } from '@/components/categories/category-picker'

interface CCTx {
  id: string
  transactionDate: string
  billingDate: string
  merchantName: string
  originalMerchantName: string
  category: string
  categoryOverride: string | null
  chargedAmount: number
  originalAmount: number
  originalCurrency: string
  chargedCurrency?: string
  reference?: string
  cardLastFour?: string
  transactionType?: string
  notes?: string
  ignored: boolean
}

const LABEL = Object.fromEntries(CARD_COLUMNS.map(c => [c.key, c.label])) as Record<CardColumn, string>

/** An optional column's cell (lib/tables/columns.ts) */
function optionalCell(tx: CCTx, key: CardColumn) {
  switch (key) {
    case 'chargedCurrency':
      return tx.chargedCurrency || '₪'
    case 'originalAmount':
      return (
        <span className="tabular-nums" dir="ltr">
          {tx.originalAmount} {tx.originalCurrency}
        </span>
      )
    case 'reference':
      return tx.reference ? <span className="tabular-nums" dir="ltr">{tx.reference}</span> : null
    case 'cardLastFour':
      return tx.cardLastFour ? <span className="tabular-nums" dir="ltr">{tx.cardLastFour}</span> : null
    case 'transactionType':
      return tx.transactionType || null
    case 'notes':
      return tx.notes || null
  }
}

interface Category { id: string; name: string }

export function CardTransactionsTable({
  accountId,
  transactions: initial,
  categories,
  activeCategory,
  showIgnored,
  hasMore: initialHasMore,
  fetchParams,
  unusual = {},
  recurring = {},
  initialColumns = [],
  categoryColors = {},
}: {
  /** The card these rows belong to */
  accountId: string
  transactions: CCTx[]
  categories: Category[]
  activeCategory?: string
  showIgnored?: boolean
  hasMore?: boolean
  fetchParams?: string
  /** Unusual-transaction flags by transaction id */
  unusual?: Record<string, UnusualFlag[]>
  /** The recurring series each transaction is in, by id (ENG-71) */
  recurring?: Record<string, RowSeries>
  /** Optional columns to show (the page reads the cookie, lib/tables/columns.ts) */
  initialColumns?: string[]
  /** Each category's chart colour, for its dot in the row and the picker */
  categoryColors?: Record<string, string>
}) {
  const [columns, setColumns] = useState(initialColumns as CardColumn[])
  // The row whose category window is open
  const [picking, setPicking] = useState<string | null>(null)
  // A row's category, when it is one of yours (an unmapped issuer category is none)
  const yours = new Set(categories.map(c => c.name))
  const known = (tx: CCTx) => {
    const c = tx.categoryOverride ?? tx.category
    return yours.has(c) ? c : null
  }
  const router = useRouter()
  const params = useSearchParams()
  const [transactions, setTransactions] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const activeMerchant = params.get('merchant')
  const pagePath = accountPath('CREDIT_CARD', accountId)
  const api = `/api/cards/${encodeURIComponent(accountId)}/transactions`

  async function loadMore() {
    if (!fetchParams) return
    setLoadingMore(true)
    const res = await fetch(`${api}?${fetchParams}&skip=${transactions.length}`)
    const more: CCTx[] = await res.json()
    setTransactions(prev => [...prev, ...more])
    setHasMore(more.length === 50)
    setLoadingMore(false)
  }

  /** 'row' sets this charge only; 'merchant' every charge of the merchant, and later files too */
  async function saveCategory(tx: CCTx, categoryOverride: string, scope: 'row' | 'merchant') {
    await fetch(`${api}/${tx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryOverride, categoryScope: scope }),
    })
    setTransactions(prev =>
      prev.map(t =>
        (scope === 'row' ? t.id === tx.id : t.originalMerchantName === tx.originalMerchantName) ? { ...t, categoryOverride } : t
      )
    )
    // The page's totals and donuts count categories too
    router.refresh()
  }

  async function toggleIgnored(tx: CCTx) {
    const ignored = !tx.ignored
    await fetch(`${api}/${tx.id}`, {
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

  function filterMerchant(name: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('merchant', name)
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

  const hasFilter = activeMerchant || activeCategory

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {hasFilter ? (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground text-xs">מסנן:</span>
            {activeMerchant && (
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                {activeMerchant}
                <button onClick={clearMerchant} aria-label="הסר מסנן בית עסק">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {activeCategory && (
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                {activeCategory}
                <button onClick={clearCategory} aria-label="הסר מסנן קטגוריה">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        ) : <div />}
        <div className="flex items-center gap-3">
          <ColumnPicker kind="card" shown={columns} onChange={next => setColumns(next as CardColumn[])} />
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

      {/* Table */}
      <div className="rounded-xl surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {/* Billing date first: rows belong to the month they are billed in (ENG-46) */}
                {['תאריך חיוב', 'תאריך עסקה', 'שם בית עסק', 'קטגוריה', 'סכום חיוב', ...columns.map(c => LABEL[c]), ''].map((h, i) => (
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
                  <td className="py-2.5 px-4 whitespace-nowrap text-xs tabular-nums">{formatDate(tx.billingDate)}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs tabular-nums">{formatDate(tx.transactionDate)}</td>
                  <td className="py-2.5 px-4 min-w-[160px]">
                    {tx.ignored ? (
                      <span className="line-through text-muted-foreground">{tx.merchantName}</span>
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary transition-colors"
                        onClick={() => filterMerchant(tx.merchantName)}
                      >
                        {tx.merchantName}
                      </span>
                    )}
                    {!tx.ignored && unusual[tx.id]?.map(f => (
                      <UnusualBadge key={f.reason} flag={f} className="ms-1.5 align-middle" />
                    ))}
                    {/* Manual recurring series: its name as a label that opens the sheet (ENG-71).
                        Phones get the mark action here too, so it needs no sideways scroll. */}
                    {!tx.ignored && recurring[tx.id]?.manual ? (
                      <MarkRecurringButton variant="label" source="card" transactionId={tx.id} seriesName={recurring[tx.id].name} className="ms-1.5" />
                    ) : (
                      !tx.ignored && tx.chargedAmount > 0 && (
                        <MarkRecurringButton source="card" transactionId={tx.id} seriesName={recurring[tx.id]?.name} className="ms-1 align-middle sm:hidden" />
                      )
                    )}
                  </td>
                  <td className="py-2.5 px-4 min-w-[140px]">
                    {tx.ignored ? (
                      <span className="line-through text-muted-foreground text-xs">
                        {tx.categoryOverride ?? tx.category}
                      </span>
                    ) : (
                      <CategoryPill
                        name={known(tx)}
                        color={known(tx) ? categoryColors[known(tx)!] : undefined}
                        sourceName={known(tx) ? undefined : tx.categoryOverride ?? tx.category}
                        onClick={() => setPicking(tx.id)}
                      />
                    )}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className={cn(
                      'tabular-nums font-medium',
                      tx.ignored ? 'line-through text-muted-foreground' : 'text-[hsl(var(--expense))]'
                    )}>
                      {formatCurrency(tx.chargedAmount)}
                    </span>
                    {!tx.ignored && tx.originalCurrency !== '₪' && !columns.includes('originalAmount') && (
                      <span className="text-xs text-muted-foreground me-1.5">
                        ({tx.originalAmount} {tx.originalCurrency})
                      </span>
                    )}
                  </td>
                  {columns.map(c => (
                    <td
                      key={c}
                      className={cn(
                        'py-2.5 px-4 text-xs text-muted-foreground',
                        c === 'notes' ? 'min-w-[140px]' : 'whitespace-nowrap',
                        tx.ignored && 'line-through'
                      )}
                    >
                      {optionalCell(tx, c)}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {/* Mark as recurring (ENG-71): expenses only. Other rows keep its place empty,
                        so the hide button sits in the same spot on every row */}
                    {!tx.ignored && tx.chargedAmount > 0 ? (
                      <MarkRecurringButton source="card" transactionId={tx.id} seriesName={recurring[tx.id]?.name} className="me-0.5 align-middle max-sm:hidden" />
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

      {/* One window for every row's category pill; the bank table opens the same one */}
      <CardCategoryWindow
        tx={picking ? transactions.find(t => t.id === picking) : undefined}
        categories={categories}
        colors={categoryColors}
        onClose={() => setPicking(null)}
        onSave={async (tx, category, scope) => {
          setPicking(null)
          await saveCategory(tx, category, scope)
        }}
      />
    </div>
  )
}

/** The category window of one card charge (components/categories/category-picker.tsx) */
function CardCategoryWindow({ tx, categories, colors, onClose, onSave }: {
  tx: CCTx | undefined
  categories: Category[]
  colors: Record<string, string>
  onClose: () => void
  onSave: (tx: CCTx, category: string, scope: 'row' | 'merchant') => Promise<void>
}) {
  // The last charge stays while the window animates out
  const [last, setLast] = useState<CCTx | undefined>(tx)
  if (tx && tx !== last) setLast(tx)
  const shown = tx ?? last
  return (
    <CategoryPicker
      open={!!tx}
      onOpenChange={o => !o && onClose()}
      context={`חיוב בכרטיס · ${shown ? formatDate(shown.transactionDate) : ''}`}
      title={shown?.merchantName ?? ''}
      amount={shown ? formatCurrency(shown.chargedAmount) : ''}
      amountTone="expense"
      categories={categories.map(c => ({ name: c.name, color: colors[c.name] }))}
      current={shown && categories.some(c => c.name === (shown.categoryOverride ?? shown.category)) ? shown.categoryOverride ?? shown.category : null}
      scopes={
        shown
          ? [
              { id: 'row', title: 'רק החיוב הזה', sub: `שאר החיובים מ${shown.merchantName} לא משתנים` },
              { id: 'merchant', title: `כל החיובים מ${shown.merchantName}`, sub: 'בכל הכרטיסים של החברה, וגם בקבצים הבאים' },
            ]
          : undefined
      }
      onSave={(category, scope) => (shown && category ? onSave(shown, category, scope === 'merchant' ? 'merchant' : 'row') : undefined)}
    />
  )
}
