'use client'

import { startTransition, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/currency'
import { X, EyeOff, Eye } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { UnusualBadge } from '@/components/insights/unusual-badge'
import type { UnusualFlag } from '@/lib/insights/unusual'
import { accountPath } from '@/lib/accounts/routes'
import { MarkRecurringButton } from '@/components/recurring/mark-recurring'
import type { RowSeries } from '@/lib/insights/recurring-overrides'
import { CARD_PAYMENT_CATEGORY, directionOf, isCardPaymentRow } from '@/lib/insights/bank-categories'
import { ColumnPicker } from '@/components/ui/column-picker'
import { useColumnMotion } from '@/hooks/use-column-motion'
import { useExit } from '@/hooks/use-exit'
import { useRiseIn } from '@/hooks/use-rise-in'
import { BANK_COLUMNS, columnsLine, type BankColumn } from '@/lib/tables/columns'
import { CategoryPicker, CategoryPill, CONTAINS_SCOPE, containsScope } from '@/components/categories/category-picker'
import { suggestKeyword } from '@/lib/insights/keyword-rules'
import { BulkCategoryBar } from '@/components/categories/bulk-category-bar'
import { AccountTag, tableScope, type TableAccount } from '@/components/accounts/account-tag'
import { CardPaymentBadges } from '@/components/bank/card-payment-badge'
import type { BadgeCard } from '@/lib/accounts/payment-badge'
import { useTargetRow } from '@/hooks/use-target-row'
import { PhoneTransactionRows, PhoneRowActions, dayKey } from '@/components/transactions/phone-rows'
import { useOptimisticRows } from '@/hooks/use-optimistic-rows'
import { bankChangeHits, idsChange, type BankScope } from '@/lib/tables/category-change'
import type { SearchResult } from '@/lib/search/query'

const LABEL = Object.fromEntries(BANK_COLUMNS.map(c => [c.key, c.label])) as Record<BankColumn, string>
const BANK_KEYS = BANK_COLUMNS.map(c => c.key)
const TH = 'text-start py-2.5 px-4 font-medium text-xs text-muted-foreground'

interface BankTx {
  id: string
  accountId?: string
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
  /** An uncategorized row's likely category (lib/insights/category-suggestions); never applied by itself */
  suggestion?: { category: string; fromAmount: number; fromDate: string }
}

interface Category { id: string; name: string }


/** Rows that take a category: the card payment and ignored rows have none */
const selectable = (tx: BankTx) => !tx.ignored && !isCardPaymentRow(tx)

export function BankTransactionsTable({
  accountId,
  accounts,
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
  categoryColors = {},
  cards = [],
}: (
  | {
      /** The bank account these rows belong to */
      accountId: string
      accounts?: never
    }
  | {
      accountId?: never
      /** The /banks table: every account's rows together. With more than one, each row
          names its account and the running balance goes (balances of different accounts
          interleaved mean nothing; the balance chart above has them) */
      accounts: TableAccount[]
    }
) & {
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
  /** Each category's chart colour, for its dot in the row and the picker */
  categoryColors?: Record<string, string>
  /** Descriptions categorised row by row, never by a rule (lib/db/generic-descriptions.ts) */
  genericDescriptions?: string[]
  /** Every card (archived too): a card-payment row links to the card(s) it paid */
  cards?: BadgeCard[]
}) {
  const [columns, setColumns] = useState(initialColumns as BankColumn[])
  const { shown: shownColumns, cellClass: columnClass } = useColumnMotion(BANK_KEYS, columns)
  const router = useRouter()
  const params = useSearchParams()
  // The rows as saved; `transactions` shows the saves still in flight on top (hooks/use-optimistic-rows.ts)
  const [saved, setTransactions] = useState(initial)
  const [transactions, show] = useOptimisticRows(saved)
  const [hasMore, setHasMore] = useState(initialHasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<{ id: string; field: 'note'; value: string } | null>(null)
  // The row whose category window is open
  const [picking, setPicking] = useState<string | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [generic, setGeneric] = useState(() => new Set(genericDescriptions))
  // Rows ticked for one category at once; the page remounts the table on a new data set, which clears it
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const activeMerchant = params.get('merchant')
  const pagePath = accountPath('BANK', accountId)
  const scope = tableScope(accountId, accounts)
  // A link's `?tx=` row (the card page's "paid from" chip) is brought into view and lit once
  const tableRef = useRef<HTMLDivElement>(null)
  useTargetRow(tableRef, transactions.map(t => t.id))
  // "טען עוד": the rows that arrive rise in, the ones on screen stay
  const riseIn = useRiseIn(tableRef)

  async function loadMore() {
    if (!fetchParams) return
    setLoadingMore(true)
    const res = await fetch(`/api/bank/transactions?${fetchParams}&${scope.query}&skip=${transactions.length}`)
    const more: BankTx[] = await res.json()
    setTransactions(prev => [...prev, ...more])
    riseIn(more.map(t => t.id))
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

  /** The error a failed write carries, or the plain one */
  const failure = async (res: Response | null) => (res && (await res.json().catch(() => null))?.error) || 'שמירת הקטגוריה נכשלה'

  /**
   * 'row' sets this row only; 'rule' every row with its description (later files too);
   * 'contains' a contains-text rule (`pattern`), which this row follows from now on.
   * The rows this reaches (lib/tables/category-change.ts) show the category at once; the
   * save runs behind. When it lands the server's answer counts (the rule's real reach,
   * on this page); when it fails the rows go back and the error shows.
   */
  function saveCategory(scope: BankScope, tx: BankTx, category: string | null, pattern?: string) {
    const patch = (t: BankTx): BankTx => ({ ...t, category, categoryManual: scope === 'row' && t.id === tx.id })
    startTransition(async () => {
      show({ hits: bankChangeHits(tx, scope), patch })
      let res: Response | null = null
      try {
        res =
          scope === 'contains'
            ? await fetch('/api/category-keyword-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern, category, fromRow: { source: 'bank', id: tx.id } }),
              })
            : await fetch(`/api/bank/transactions/${tx.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, categoryScope: scope }),
              })
      } catch {}
      if (!res?.ok) {
        const error = await failure(res)
        startTransition(() => setCategoryError(error))
        return
      }
      // A rule also reaches rows on other pages and accounts (a text rule the cards too); these are the loaded ones
      const answer = (await res.json()) as { updatedIds?: string[]; bankIds?: string[] }
      const change = idsChange(answer.updatedIds ?? answer.bankIds ?? [], patch)
      startTransition(() => {
        setCategoryError(null)
        setTransactions(prev => prev.map(t => (change.hits(t) ? change.patch(t) : scope === 'contains' && t.id === tx.id ? { ...t, categoryManual: false } : t)))
      })
      // The page's totals and donuts count categories too
      router.refresh()
    })
  }

  /** Marks a row's description generic (its rules go), then saves the category picked in the window for that row */
  async function markGeneric(tx: BankTx, category: string | null) {
    const res = await fetch('/api/bank/generic-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: tx.originalDescription }),
    })
    setPicking(null)
    if (!res.ok) {
      setCategoryError((await res.json().catch(() => null))?.error ?? 'הסימון נכשל')
      return
    }
    const cleared = new Set((await res.json()).clearedIds as string[])
    setGeneric(prev => new Set(prev).add(tx.originalDescription))
    setTransactions(prev => prev.map(t => (cleared.has(t.id) ? { ...t, category: null } : t)))
    // Saving refreshes the page's totals and donuts, which counted the cleared rule categories too
    if (category !== null) saveCategory('row', tx, category)
    else router.refresh()
  }

  const pickingTx = picking ? transactions.find(t => t.id === picking) : undefined

  const selectableRows = transactions.filter(selectable)
  const allSelected = selectableRows.length > 0 && selectableRows.every(t => selected.has(t.id))

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map(t => t.id)))
  }

  /**
   * The ticked rows show the category at once and the selection clears; the save runs
   * behind. When it fails the rows go back and the selection returns with the error.
   */
  async function saveBulkCategory(category: string | null) {
    const ids = [...selected]
    const patch = (t: BankTx): BankTx => ({ ...t, category, categoryManual: true })
    setSelected(new Set())
    startTransition(async () => {
      show(idsChange(ids, patch))
      let res: Response | null = null
      try {
        res = await fetch('/api/bank/transactions/bulk-category', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, category }),
        })
      } catch {}
      if (!res?.ok) {
        const error = await failure(res)
        startTransition(() => {
          setCategoryError(error)
          setSelected(new Set(ids))
        })
        return
      }
      const change = idsChange((await res.json() as { updatedIds: string[] }).updatedIds, patch)
      startTransition(() => {
        setCategoryError(null)
        setTransactions(prev => prev.map(t => (change.hits(t) ? change.patch(t) : t)))
      })
      router.refresh()
    })
  }

  /** A suggestion's click: this row only, as "רק תנועה זו" would save it */
  function acceptSuggestion(tx: BankTx, category: string) {
    saveCategory('row', tx, category)
  }

  async function toggleIgnored(tx: BankTx) {
    // An ignored row takes no category, so it leaves the selection
    if (!tx.ignored) setSelected(prev => (prev.has(tx.id) ? new Set([...prev].filter(id => id !== tx.id)) : prev))
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

  // The phone rows (components/transactions/phone-rows.tsx): the same transactions as search results
  const phoneRows: SearchResult[] = transactions.map(tx => ({
    id: tx.id,
    source: 'bank',
    accountId: tx.accountId ?? accountId ?? '',
    accountName: (tx.accountId ? scope.byId.get(tx.accountId)?.name : undefined) ?? '',
    date: dayKey(tx.date),
    dateMs: 0,
    description: tx.description,
    amount: tx.debit > 0 ? tx.debit : -tx.credit,
    category: isCardPaymentRow(tx) ? CARD_PAYMENT_CATEGORY : (tx.category ?? undefined),
    note: tx.note || undefined,
    ignored: tx.ignored,
    recurringLabel: recurring[tx.id]?.manual ? recurring[tx.id].name : undefined,
  }))
  const txById = new Map(transactions.map(t => [t.id, t]))
  // The bulk bar eases out when the last tick goes, with the rows it showed
  const bulk = useExit(selected.size > 0 ? transactions.filter(t => selected.has(t.id)) : null)

  return (
    <div className="space-y-3">
      {/* All / income / expenses: pills on their own row, so the toolbar below is the
          same on every table (the card tables have no such filter) */}
      {flowFilter}
      {/* Toolbar: the active filters at the start, "עמודות" and "הצג מוסתרים" always at the end */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
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
        <div className="ms-auto flex items-center gap-3">
          {/* Desktop: columns of the table; phones: a line under every row */}
          <ColumnPicker kind="bank" shown={columns} onChange={next => setColumns(next as BankColumn[])} />
          {/* 44px tall (the padding, taken back by the margin so the toolbar keeps its height), not wider than its text */}
          <label className="-my-3 flex min-h-11 items-center gap-2 py-3 text-sm text-muted-foreground cursor-pointer select-none">
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

      {bulk.item && (
        <BankBulkBar
          rows={bulk.item}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          colors={categoryColors}
          onApply={saveBulkCategory}
          onClear={() => setSelected(new Set())}
          leaving={bulk.leaving}
        />
      )}

      {/* Table; data-swap: it eases in when the page swaps the rows (components/ui/data-swap.tsx) */}
      <div ref={tableRef} data-swap className="rounded-xl surface overflow-hidden">
        <PhoneTransactionRows
          rows={phoneRows}
          selected={selected}
          canSelect={r => selectable(txById.get(r.id)!)}
          onToggle={toggleSelected}
          onOpen={r => setPicking(r.id)}
          showAccount={scope.several}
          categoryColor={r => (r.category ? categoryColors[r.category] : undefined)}
          // "עמודות" on phones: the picked ones as a line under every row
          extra={columns.length ? r => columnsLine('bank', columns, { reference: txById.get(r.id)!.reference }) : undefined}
          meta={r => {
            const tx = txById.get(r.id)!
            return !tx.ignored && isCardPaymentRow(tx) ? (
              <CardPaymentBadges
                descriptions={[tx.originalDescription, tx.description]}
                bankAccountId={tx.accountId ?? accountId}
                date={tx.date}
                cards={cards}
              />
            ) : null
          }}
        />
        {transactions.length === 0 && (
          <p className="text-center py-10 text-muted-foreground text-sm md:hidden">אין עסקאות לתקופה זו</p>
        )}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-0 py-2.5 ps-4 pe-0">
                  <label className="-m-3.5 inline-flex p-3.5 align-middle">
                    <input
                      type="checkbox"
                      aria-label="בחירת כל התנועות שנטענו"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && !allSelected }}
                      disabled={selectableRows.length === 0}
                      onChange={toggleAll}
                      className="accent-primary h-4 w-4 cursor-pointer disabled:cursor-default"
                    />
                  </label>
                </th>
                {[
                  'תאריך',
                  'תיאור',
                  ...(scope.several ? ['חשבון'] : []),
                  'קטגוריה',
                  'חובה',
                  'זכות',
                  ...(scope.several ? [] : ['יתרה']),
                  'הערה',
                ].map((h, i) => (
                  <th key={i} className={TH}>{h}</th>
                ))}
                {/* Optional columns slide in and fade out as they're picked (useColumnMotion) */}
                {shownColumns.map(c => (
                  <th key={c} className={cn(TH, columnClass(c))}>{LABEL[c]}</th>
                ))}
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr
                  key={tx.id}
                  data-row-id={tx.id}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/30',
                    tx.ignored && 'opacity-40',
                    selected.has(tx.id) && 'bg-primary/5'
                  )}
                >
                  <td className="w-0 py-2.5 ps-4 pe-0">
                    {/* The padding widens the tap target past the small box, for phones */}
                    <label className="-m-3.5 inline-flex p-3.5 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`בחירת ${tx.description}`}
                        checked={selected.has(tx.id)}
                        disabled={!selectable(tx)}
                        onChange={() => toggleSelected(tx.id)}
                        className="accent-primary h-4 w-4 cursor-pointer disabled:cursor-default disabled:opacity-30"
                      />
                    </label>
                  </td>
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
                    {/* A card payment: the card(s) it paid, each opening that card's month */}
                    {!tx.ignored && isCardPaymentRow(tx) && (
                      <CardPaymentBadges
                        descriptions={[tx.originalDescription, tx.description]}
                        bankAccountId={tx.accountId ?? accountId}
                        date={tx.date}
                        cards={cards}
                        className="ms-1.5"
                      />
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
                  {scope.several && (
                    <td className="py-2.5 px-4">
                      <AccountTag account={tx.accountId ? scope.byId.get(tx.accountId) : undefined} />
                    </td>
                  )}
                  <td className="py-2.5 px-4 min-w-[140px] align-top">
                    <CategoryCell
                      tx={tx}
                      color={tx.category ? categoryColors[tx.category] : undefined}
                      onOpen={() => setPicking(tx.id)}
                      onSuggest={category => acceptSuggestion(tx, category)}
                    />
                  </td>
                  <td className="py-2.5 px-4 text-[hsl(var(--expense))] font-medium tabular-nums">
                    {tx.debit > 0 ? formatCurrency(tx.debit) : ''}
                  </td>
                  <td className="py-2.5 px-4 text-[hsl(var(--income))] font-medium tabular-nums">
                    {tx.credit > 0 ? formatCurrency(tx.credit) : ''}
                  </td>
                  {!scope.several && (
                    <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground tabular-nums">{formatCurrency(tx.balance)}</td>
                  )}
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
                  {shownColumns.includes('reference') && (
                    <td className={cn('py-2.5 px-4 whitespace-nowrap text-xs text-muted-foreground tabular-nums', columnClass('reference'), tx.ignored && 'line-through')}>
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
                      // The 22px button's hit area: 44px tall, and sideways only into its own cell's end padding
                      // (never into the recurring button before it)
                      className="relative p-1 rounded-md hover:bg-muted transition-colors align-middle before:absolute before:-inset-y-[11px] before:start-0 before:-end-4 before:content-['']"
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

      {/* One window for every row's category pill; the card table opens the same one */}
      <BankCategoryWindow
        tx={pickingTx}
        generic={!!pickingTx && generic.has(pickingTx.originalDescription)}
        categories={pickingTx && directionOf(pickingTx) === 'IN' ? incomeCategories : expenseCategories}
        colors={categoryColors}
        onClose={() => setPicking(null)}
        onSave={(tx, category, scope, pattern) => {
          setPicking(null)
          if (scope === CONTAINS_SCOPE && category && pattern) saveCategory('contains', tx, category, pattern)
          else saveCategory(scope === 'rule' ? 'rule' : 'row', tx, category)
        }}
        onFilterMerchant={tx => {
          setPicking(null)
          filterMerchant(tx.description)
        }}
        onMarkGeneric={markGeneric}
        footer={tx => (
          <PhoneRowActions
            source="bank"
            id={tx.id}
            seriesName={recurring[tx.id]?.name}
            canMark={!tx.ignored && tx.debit > 0}
            ignored={tx.ignored}
            onToggleIgnored={async () => { setPicking(null); await toggleIgnored(tx) }}
          />
        )}
      />
    </div>
  )
}

/** The category window of one bank row (components/categories/category-picker.tsx) */
function BankCategoryWindow({ tx, generic, categories, colors, onClose, onSave, onFilterMerchant, onMarkGeneric, footer }: {
  tx: BankTx | undefined
  generic: boolean
  categories: Category[]
  colors: Record<string, string>
  onClose: () => void
  onSave: (tx: BankTx, category: string | null, scope: string | null, pattern?: string) => void
  /** "כל העסקאות מהעסק הזה": filter the table to the row's description */
  onFilterMerchant: (tx: BankTx) => void
  onMarkGeneric: (tx: BankTx, category: string | null) => void
  /** Phone-only row actions (components/transactions/phone-rows.tsx) */
  footer?: (tx: BankTx) => ReactNode
}) {
  // The last row stays while the window animates out
  const [last, setLast] = useState<BankTx | undefined>(tx)
  if (tx && tx !== last) setLast(tx)
  const shown = tx ?? last
  const out = shown ? directionOf(shown) === 'OUT' : true
  const direction = out ? 'היוצאות' : 'הנכנסות'
  return (
    <CategoryPicker
      open={!!tx}
      onOpenChange={o => !o && onClose()}
      context={`${out ? 'תנועה יוצאת' : 'תנועה נכנסת'} בבנק · ${shown ? formatDate(shown.date) : ''}`}
      title={shown?.description ?? ''}
      detail={shown?.note || undefined}
      amount={shown ? formatCurrency(out ? shown.debit : shown.credit) : ''}
      amountTone={out ? 'expense' : 'income'}
      categories={categories.map(c => ({ name: c.name, color: colors[c.name] }))}
      createKind={out ? 'EXPENSE' : 'INCOME'}
      current={shown?.category ?? null}
      allowNone
      scopes={
        generic || !shown
          ? undefined
          : [
              { id: 'row', title: 'רק התנועה הזאת', sub: 'שאר התנועות עם התיאור הזה לא משתנות' },
              { id: 'rule', title: `כל התנועות ${direction} "${shown.originalDescription}"`, sub: 'כולל תנועות שיועלו בהמשך; תנועה שבחרת לה ידנית לא משתנה' },
              containsScope(shown.originalDescription, out ? 'EXPENSE' : 'INCOME', suggestKeyword(shown.originalDescription)),
            ]
      }
      note={generic && shown ? `"${shown.originalDescription}" הוא תיאור כללי: הקטגוריה נשמרת לתנועה הזאת בלבד.` : undefined}
      suggestion={
        shown?.suggestion && !shown.category
          ? { category: shown.suggestion.category, reason: `כמו ${formatCurrency(shown.suggestion.fromAmount)} ב־${formatDate(shown.suggestion.fromDate)}` }
          : undefined
      }
      bodyDisabled={!!shown && !selectable(shown)}
      merchantYear={shown ? { source: 'bank', id: shown.id, year: new Date(shown.date).getFullYear() } : undefined}
      merchantAll={shown && !shown.ignored ? { onClick: () => onFilterMerchant(shown) } : undefined}
      footer={shown && footer?.(shown)}
      extraAction={!generic && shown ? { label: 'זה תיאור כללי', onClick: category => onMarkGeneric(shown, category) } : undefined}
      onSave={(category, scope, pattern) => (shown ? onSave(shown, category, scope, pattern) : undefined)}
    />
  )
}

/**
 * A row's category: a pill that opens the category window (CategoryPicker, as on the
 * card table), with the suggestion under it while the row has none.
 * The card payment has none: its breakdown is the card's own categories.
 */
function CategoryCell({ tx, color, onOpen, onSuggest }: {
  tx: BankTx
  color?: string
  onOpen: () => void
  onSuggest: (category: string) => void
}) {
  if (isCardPaymentRow(tx)) {
    return <span className="text-xs text-muted-foreground" title="הפירוט לפי קטגוריה נמצא בכרטיס">{CARD_PAYMENT_CATEGORY}</span>
  }
  if (tx.ignored) {
    return <span className="line-through text-muted-foreground text-xs">{tx.category ?? ''}</span>
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <CategoryPill name={tx.category} color={color} onClick={onOpen} />
      {/* A quiet guess under the pill while the row has no category */}
      {tx.suggestion && !tx.category && (
        <button
          onClick={() => onSuggest(tx.suggestion!.category)}
          title={`כמו ${formatCurrency(tx.suggestion.fromAmount)} ב־${formatDate(tx.suggestion.fromDate)}`}
          className="block max-w-40 truncate rounded-full border border-dashed border-foreground/20 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <bdi>{tx.suggestion.category}</bdi>?
        </button>
      )}
    </div>
  )
}

/** The shared bulk bar for ticked bank rows: their direction picks expense or income categories */
function BankBulkBar({ rows, expenseCategories, incomeCategories, colors, onApply, onClear, leaving }: {
  rows: BankTx[]
  expenseCategories: Category[]
  incomeCategories: Category[]
  colors: Record<string, string>
  onApply: (category: string | null) => Promise<void>
  onClear: () => void
  leaving: boolean
}) {
  const directions = new Set(rows.map(directionOf))
  const income = directions.has('IN')
  const categories = income ? incomeCategories : expenseCategories
  return (
    <BulkCategoryBar
      count={rows.length}
      kind={directions.size > 1 ? 'mixed' : income ? 'income' : 'expense'}
      context={income ? 'תנועות נכנסות בבנק' : 'תנועות יוצאות בבנק'}
      amount={formatCurrencyWhole(rows.reduce((s, r) => s + (income ? r.credit : r.debit), 0))}
      categories={categories.map(c => ({ name: c.name, color: colors[c.name] }))}
      allowNone
      onApply={onApply}
      onClear={onClear}
      leaving={leaving}
    />
  )
}
