'use client'

import type { ReactNode } from 'react'
import { Eye, EyeOff, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { MarkRecurringButton } from '@/components/recurring/mark-recurring'
import { SearchResultList } from '@/components/search/search-result-list'
import type { SearchResult } from '@/lib/search/query'

/** An ISO timestamp as the local calendar day (YYYY-MM-DD), the way the tables' dates are read */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The transaction tables on phones: the search page's row (SearchResultList), one per
 * transaction, edge to edge in the table's card: description, amount at the end and one
 * meta line (date, category). Tapping a row opens its window, which carries the row's
 * actions on phones (`PhoneRowActions`). Shown below `md` only (the table is `hidden md:block`).
 */
export function PhoneTransactionRows({
  rows,
  selected,
  canSelect,
  onToggle,
  onOpen,
  showAccount,
  meta,
  amountNote,
  className,
}: {
  rows: SearchResult[]
  selected: ReadonlySet<string>
  canSelect: (row: SearchResult) => boolean
  onToggle: (id: string) => void
  /** Open the row's window (every row, hidden ones too, so they can be unhidden) */
  onOpen: (row: SearchResult) => void
  /** Name the account in each row (a combined table) */
  showAccount: boolean
  /** Badges at the end of the meta line (a card payment's cards) */
  meta?: (row: SearchResult) => ReactNode
  /** A small line under the amount */
  amountNote?: (row: SearchResult) => string | undefined
  className?: string
}) {
  return (
    <div className={cn('md:hidden', className)}>
      <SearchResultList
        results={rows}
        terms={[]}
        edge
        compact
        hideIcon
        showAccount={showAccount}
        idPrefix="phone-row"
        onOpen={onOpen}
        meta={meta}
        amountNote={amountNote}
        rowClassName={r => (selected.has(r.id) ? 'bg-primary/5' : undefined)}
        leading={r => (
          <label className="-my-1 ms-2 flex h-11 w-9 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`בחירת ${r.description}`}
              checked={selected.has(r.id)}
              disabled={!canSelect(r)}
              onChange={() => onToggle(r.id)}
              className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-30"
            />
          </label>
        )}
      />
    </div>
  )
}

/**
 * The row actions the phone rows leave out, as a footer of the row's window (below `md`
 * only; on desktop the table has its own buttons). Two 44px buttons in fixed places:
 * mark as recurring (expenses that aren't hidden; dimmed otherwise) and hide / unhide.
 */
export function PhoneRowActions({
  source,
  id,
  seriesName,
  canMark,
  ignored,
  onToggleIgnored,
}: {
  source: 'bank' | 'card'
  id: string
  seriesName?: string
  /** An expense that isn't hidden */
  canMark: boolean
  ignored: boolean
  onToggleIgnored: () => void
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
      {canMark ? (
        <MarkRecurringButton variant="button" source={source} transactionId={id} seriesName={seriesName} />
      ) : (
        <button type="button" disabled className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm opacity-40">
          <Repeat className="h-4 w-4" aria-hidden />
          חיוב קבוע
        </button>
      )}
      <button
        type="button"
        onClick={onToggleIgnored}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm transition-[background-color,transform] duration-quick ease-ui hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ignored ? <Eye className="h-4 w-4 text-primary" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
        {ignored ? 'בטל הסתרה' : 'הסתר'}
      </button>
    </div>
  )
}
