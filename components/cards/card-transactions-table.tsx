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
  ignored: boolean
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
  /** Name of the recurring series each transaction is in, by id (ENG-71) */
  recurring?: Record<string, string>
}) {
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

  async function saveCategory(tx: CCTx, categoryOverride: string) {
    await fetch(`${api}/${tx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryOverride }),
    })
    setTransactions(prev =>
      prev.map(t =>
        t.originalMerchantName === tx.originalMerchantName ? { ...t, categoryOverride } : t
      )
    )
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

      {/* Table */}
      <div className="rounded-xl surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {/* Billing date first: rows belong to the month they are billed in (ENG-46) */}
                {['תאריך חיוב', 'תאריך עסקה', 'שם בית עסק', 'קטגוריה', 'סכום חיוב', ''].map((h, i) => (
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
                  </td>
                  <td className="py-2.5 px-4 min-w-[140px]">
                    {tx.ignored ? (
                      <span className="line-through text-muted-foreground text-xs">
                        {tx.categoryOverride ?? tx.category}
                      </span>
                    ) : (
                      <select
                        className="text-xs"
                        value={tx.categoryOverride ?? tx.category}
                        onChange={e => saveCategory(tx, e.target.value)}
                      >
                        {tx.categoryOverride && tx.categoryOverride !== tx.category &&
                          !categories.some(c => c.name === tx.categoryOverride) && (
                          <option value={tx.categoryOverride}>{tx.categoryOverride}</option>
                        )}
                        <option value={tx.category}>{tx.category}</option>
                        {categories
                          .filter(c => c.name !== tx.category)
                          .map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className={cn(
                      'tabular-nums font-medium',
                      tx.ignored ? 'line-through text-muted-foreground' : 'text-[hsl(var(--expense))]'
                    )}>
                      {formatCurrency(tx.chargedAmount)}
                    </span>
                    {!tx.ignored && tx.originalCurrency !== '₪' && (
                      <span className="text-xs text-muted-foreground me-1.5">
                        ({tx.originalAmount} {tx.originalCurrency})
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {/* Mark as recurring (ENG-71): expenses only */}
                    {!tx.ignored && tx.chargedAmount > 0 && (
                      <MarkRecurringButton source="card" transactionId={tx.id} seriesName={recurring[tx.id]} className="me-0.5 align-middle" />
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
