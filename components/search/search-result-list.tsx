import type { ReactNode } from 'react'
import Link from 'next/link'
import { Building2, CreditCard, EyeOff, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import { highlightParts, transactionHref, type SearchResult } from '@/lib/search/query'

/** Text with every term wrapped in <mark> */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-primary/20 px-px text-inherit dark:bg-primary/30">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

/** DD.MM.YYYY straight from the YYYY-MM-DD key, so server and browser agree */
const displayDate = (key: string) => key.split('-').reverse().join('.')

const matches = (text: string | undefined, terms: string[]) =>
  !!text && terms.some(t => text.toLowerCase().includes(t.toLowerCase()))

interface Props {
  results: SearchResult[]
  terms: string[]
  /** Index of the keyboard-highlighted row (command dialog) */
  activeIndex?: number
  onNavigate?: () => void
  onHover?: (index: number) => void
  compact?: boolean
  /** Prefix for row ids, for aria-activedescendant */
  idPrefix?: string
  /** Per-row control beside the link (e.g. mark as recurring); not inside the link */
  actions?: (result: SearchResult) => ReactNode
  /** Per-row control before the link (a selection checkbox) */
  leading?: (result: SearchResult) => ReactNode
  /** The category is shown by `actions` (a pill that opens the category window), not as a chip in the link */
  categoryInActions?: boolean
  /** The row opens something in place (a window) instead of linking to its account page; the row is then a button */
  onOpen?: (result: SearchResult) => void
  /** Extra classes for a row (e.g. a selected tint) */
  rowClassName?: (result: SearchResult) => string | undefined
  /** Name the account in each row; off where the list is one account's own page */
  showAccount?: boolean
  /** Always show the row's note under it (search shows it only when it matches) */
  showNote?: boolean
  /** Rows run edge to edge in their card: the text starts at the card's own padding (px-4) */
  edge?: boolean
  /** Leave out the source icon tile at the row's start */
  hideIcon?: boolean
  /** Badges at the end of the meta line (links, so a row with `onOpen` keeps them clickable) */
  meta?: (result: SearchResult) => ReactNode
  /** A small muted second line under the amount (e.g. the original foreign amount) */
  amountNote?: (result: SearchResult) => string | undefined
}

/** Search hits: description, date, account, category chip and signed amount; each row links to its account page. */
export function SearchResultList({ results, terms, activeIndex, onNavigate, onHover, compact, idPrefix = 'search-result', actions, leading, categoryInActions, onOpen, rowClassName, showAccount = true, showNote, edge, hideIcon, meta, amountNote }: Props) {
  return (
    <ul className="flex flex-col divide-y divide-border/60" role={activeIndex !== undefined ? 'listbox' : undefined}>
      {results.map((r, i) => {
        const income = r.amount < 0
        const Icon = r.source === 'bank' ? Building2 : CreditCard
        const rowClass = cn(
          'flex min-h-11 items-start gap-3 px-2 text-start transition-colors hover:bg-muted/70',
          edge ? 'px-4' : 'rounded-lg',
          (actions || leading) && 'min-w-0 flex-1',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'py-2' : 'py-3',
          activeIndex === i && 'bg-muted',
          r.ignored && 'opacity-60'
        )
        const body = (
          <>
              {!hideIcon && (
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1">
                {/* Wide screens: the account joins the first line, next to the amount */}
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    <Highlight text={r.description} terms={terms} />
                  </span>
                  {showAccount && (
                    <span className="hidden max-w-[40%] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                      {r.accountName}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{displayDate(r.date)}</span>
                  {showAccount && <span aria-hidden className="sm:hidden">·</span>}
                  {showAccount && <span className="truncate sm:hidden">{r.accountName}</span>}
                  {r.category && !categoryInActions && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {r.category}
                    </span>
                  )}
                  {r.recurringLabel && (
                    <span className="inline-flex max-w-[9rem] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/15">
                      <Repeat className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{r.recurringLabel}</span>
                    </span>
                  )}
                  {r.ignored && (
                    <span className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px]">
                      <EyeOff className="h-3 w-3" aria-hidden />
                      מוסתרת
                    </span>
                  )}
                  {/* Links inside a row that is a button sit above its stretched hit area */}
                  {meta && <span className="pointer-events-auto relative">{meta(r)}</span>}
                </span>
                {matches(r.originalDescription, terms) && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground" dir="auto">
                    <Highlight text={r.originalDescription!} terms={terms} />
                  </span>
                )}
                {r.note && (showNote || matches(r.note, terms)) && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    הערה: <Highlight text={r.note} terms={terms} />
                  </span>
                )}
                {matches(r.reference, terms) && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    אסמכתא: <bdi dir="ltr"><Highlight text={r.reference!} terms={terms} /></bdi>
                  </span>
                )}
              </span>
              <span className="shrink-0 text-end">
                <span
                  className={cn(
                    'block text-sm font-semibold tabular-nums',
                    income && 'text-[hsl(var(--income))]'
                  )}
                >
                  {/* positive = money out; money in is shown green with a plus */}
                  {`${income ? '+' : ''}${formatCurrency(Math.abs(r.amount))}`}
                </span>
                {amountNote?.(r) && (
                  <span className="block text-[11px] tabular-nums text-muted-foreground" dir="ltr">{amountNote(r)}</span>
                )}
              </span>
          </>
        )
        return (
          <li
            key={`${r.source}:${r.id}`}
            id={`${idPrefix}-${i}`}
            data-row-id={r.id}
            role={activeIndex !== undefined ? 'option' : undefined}
            aria-selected={activeIndex !== undefined ? activeIndex === i : undefined}
            className={cn((actions || leading) && 'flex items-start gap-1', onOpen && 'relative', rowClassName?.(r))}
          >
            {leading && <div className={cn('relative z-10 shrink-0', compact ? 'pt-2' : 'pt-3')}>{leading(r)}</div>}
            {onOpen ? (
              <>
                {/* The row opens in place: a button stretched over it, so links in the meta line stay clickable */}
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  aria-label={r.description}
                  className="absolute inset-0 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
                <div className={cn(rowClass, 'pointer-events-none relative hover:bg-transparent')}>{body}</div>
              </>
            ) : (
              <Link
                href={transactionHref(r)}
                onClick={onNavigate}
                onMouseMove={onHover ? () => onHover(i) : undefined}
                tabIndex={activeIndex !== undefined ? -1 : undefined}
                className={rowClass}
              >
                {body}
              </Link>
            )}
            {actions && <div className={cn('shrink-0', compact ? 'pt-2' : 'pt-3')}>{actions(r)}</div>}
          </li>
        )
      })}
    </ul>
  )
}
