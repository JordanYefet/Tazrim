'use client'

import type { ReactNode } from 'react'
import { Eye, EyeOff, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { MarkRecurringButton } from '@/components/recurring/mark-recurring'
import { formatCurrency } from '@/lib/utils/currency'
import type { SearchResult } from '@/lib/search/query'

/** An ISO timestamp as the local calendar day (YYYY-MM-DD), the way the tables' dates are read */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const displayDate = (key: string) => key.split('-').reverse().join('.')

/**
 * The transaction tables on phones: one row per transaction, edge to edge in the table's
 * card, every row the same height and every part in the same place on every row and page:
 *
 *   description ……………………… amount
 *   [● category]  date · account · badges ……… note under the amount (foreign currency)
 *   the columns picked in "עמודות" (only when some are; then on every row)
 *
 * The category is always the first thing on the second line, in its own colour ("ללא
 * קטגוריה" holds its place when there is none). Nothing wraps: what doesn't fit is cut.
 * Tapping a row opens its window, which carries the row's actions on phones
 * (`PhoneRowActions`). Shown below `md` only (the table is `hidden md:block`).
 */
export function PhoneTransactionRows({
  rows,
  selected,
  canSelect,
  onToggle,
  onOpen,
  showAccount,
  categoryColor,
  meta,
  amountNote,
  extra,
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
  /** The category's colour (the same as its dot in the charts) */
  categoryColor?: (row: SearchResult) => string | undefined
  /** Badges at the end of the second line (a card payment's cards) */
  meta?: (row: SearchResult) => ReactNode
  /** A small note under the amount */
  amountNote?: (row: SearchResult) => string | undefined
  /** The "עמודות" picked for the table, as one line per row; undefined = no such line */
  extra?: (row: SearchResult) => string
  className?: string
}) {
  return (
    <div className={cn('md:hidden', className)}>
      <ul className="flex flex-col divide-y divide-border/60">
        {rows.map((r, i) => {
          const income = r.amount < 0
          const color = r.category ? categoryColor?.(r) : undefined
          const note = amountNote?.(r)
          const badges = meta?.(r)
          const extraText = extra?.(r)
          return (
            <li
              key={`${r.source}:${r.id}`}
              id={`phone-row-${i}`}
              data-row-id={r.id}
              className={cn('relative flex items-start gap-1', selected.has(r.id) && 'bg-primary/5')}
            >
              <div className="relative z-10 shrink-0 pt-2">
                <label className="-my-1 flex h-11 w-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`בחירת ${r.description}`}
                    checked={selected.has(r.id)}
                    disabled={!canSelect(r)}
                    onChange={() => onToggle(r.id)}
                    className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-30"
                  />
                </label>
              </div>
              {/* The row opens in place: a button stretched over it, so links in the badges stay clickable */}
              <button
                type="button"
                onClick={() => onOpen(r)}
                aria-label={r.description}
                className="absolute inset-0 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <div className={cn('pointer-events-none relative min-w-0 flex-1 py-2.5 pe-4', r.ignored && 'opacity-60')}>
                <div className="flex h-5 min-w-0 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.description}</span>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', income && 'text-[hsl(var(--income))]')}>
                    {/* positive = money out; money in is shown green with a plus */}
                    {`${income ? '+' : ''}${formatCurrency(Math.abs(r.amount))}`}
                  </span>
                </div>
                <div className="mt-1 flex h-[22px] min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                  <span
                    className={cn(
                      'inline-flex h-[22px] max-w-[45%] shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium',
                      r.category ? 'text-foreground' : 'bg-muted text-muted-foreground'
                    )}
                    style={color ? { backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` } : undefined}
                  >
                    {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
                    <span className="truncate">{r.category ?? 'ללא קטגוריה'}</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="tabular-nums">{displayDate(r.date)}</span>
                    {showAccount && r.accountName && <> · {r.accountName}</>}
                  </span>
                  {r.recurringLabel && <Repeat className="h-3.5 w-3.5 shrink-0 text-primary" aria-label={`חיוב קבוע: ${r.recurringLabel}`} />}
                  {r.ignored && <EyeOff className="h-3.5 w-3.5 shrink-0" aria-label="מוסתרת" />}
                  {/* Links inside a row that is a button sit above its stretched hit area */}
                  {badges && <span className="pointer-events-auto relative shrink-0">{badges}</span>}
                  {note && (
                    <span className="shrink-0 text-[11px] tabular-nums" dir="ltr">
                      {note}
                    </span>
                  )}
                </div>
                {extraText !== undefined && (
                  <p className="mt-1 h-4 truncate text-[11px] leading-4 text-muted-foreground">{extraText || '—'}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
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
