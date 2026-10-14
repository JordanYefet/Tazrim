import Link from 'next/link'
import { Building2, CreditCard, EyeOff } from 'lucide-react'
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
}

/** Search hits: description, date, account, category chip and signed amount; each row links to its account page. */
export function SearchResultList({ results, terms, activeIndex, onNavigate, onHover, compact, idPrefix = 'search-result' }: Props) {
  return (
    <ul className="flex flex-col divide-y divide-border/60" role={activeIndex !== undefined ? 'listbox' : undefined}>
      {results.map((r, i) => {
        const income = r.amount < 0
        const Icon = r.source === 'bank' ? Building2 : CreditCard
        return (
          <li
            key={`${r.source}:${r.id}`}
            id={`${idPrefix}-${i}`}
            role={activeIndex !== undefined ? 'option' : undefined}
            aria-selected={activeIndex !== undefined ? activeIndex === i : undefined}
          >
            <Link
              href={transactionHref(r)}
              onClick={onNavigate}
              onMouseMove={onHover ? () => onHover(i) : undefined}
              tabIndex={activeIndex !== undefined ? -1 : undefined}
              className={cn(
                'flex items-start gap-3 rounded-lg px-2 transition-colors hover:bg-muted/70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                compact ? 'py-2' : 'py-3',
                activeIndex === i && 'bg-muted',
                r.ignored && 'opacity-60'
              )}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                {/* Wide screens: the account joins the first line, next to the amount */}
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    <Highlight text={r.description} terms={terms} />
                  </span>
                  <span className="hidden max-w-[40%] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                    {r.accountName}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{displayDate(r.date)}</span>
                  <span aria-hidden className="sm:hidden">·</span>
                  <span className="truncate sm:hidden">{r.accountName}</span>
                  {r.category && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {r.category}
                    </span>
                  )}
                  {r.ignored && (
                    <span className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px]">
                      <EyeOff className="h-3 w-3" aria-hidden />
                      מוסתרת
                    </span>
                  )}
                </span>
                {matches(r.originalDescription, terms) && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground" dir="auto">
                    <Highlight text={r.originalDescription!} terms={terms} />
                  </span>
                )}
                {r.note && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    הערה: <Highlight text={r.note} terms={terms} />
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  income && 'text-[hsl(var(--income))]'
                )}
              >
                {/* positive = money out; money in is shown green with a plus */}
                {`${income ? '+' : ''}${formatCurrency(Math.abs(r.amount))}`}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
