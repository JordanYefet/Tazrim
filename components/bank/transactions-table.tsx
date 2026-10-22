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

interface BankTx {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  balance: number
  note: string
  ignored: boolean
}

export function BankTransactionsTable({
  accountId,
  transactions: initial,
  showIgnored,
  hasMore: initialHasMore,
  fetchParams,
  unusual = {},
  recurring = {},
}: {
  /** The bank account these rows belong to */
  accountId: string
  transactions: BankTx[]
  showIgnored?: boolean
  hasMore?: boolean
  fetchParams?: string
  /** Unusual-transaction flags by transaction id */
  unusual?: Record<string, UnusualFlag[]>
  /** The recurring series each transaction is in, by id (ENG-71) */
  recurring?: Record<string, RowSeries>
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [transactions, setTransactions] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<{ id: string; field: 'note'; value: string } | null>(null)
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
        {activeMerchant ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground text-xs">מסנן:</span>
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
              {activeMerchant}
              <button onClick={clearMerchant} aria-label="הסר מסנן" className="hover:text-primary/70 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
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
                {['תאריך', 'תיאור', 'חובה', 'זכות', 'יתרה', 'הערה', ''].map((h, i) => (
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
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {/* Mark as recurring (ENG-71): expenses only */}
                    {!tx.ignored && tx.debit > 0 && (
                      <MarkRecurringButton source="bank" transactionId={tx.id} seriesName={recurring[tx.id]?.name} className="me-0.5 align-middle max-sm:hidden" />
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
