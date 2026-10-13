import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { UnusualTransaction } from '@/lib/insights/unusual'
import { formatCurrency } from '@/lib/utils/currency'
import { UnusualBadge } from './unusual-badge'
import { unusualFlagDetail } from './unusual-copy'

interface Props {
  items: UnusualTransaction[]
  /** When given, each row gets a "not unusual" button */
  onDismiss?: (item: UnusualTransaction) => void
  title?: string
  subtitle?: string
  limit?: number
  /** Rendered under the list (e.g. "show all" or an undo notice) */
  footer?: ReactNode
}

const SOURCE_LABEL = { bank: 'בנק', card: 'כרטיס' } as const

/** DD.MM.YYYY straight from the YYYY-MM-DD key, so server and browser always agree */
const displayDate = (key: string) => key.split('-').reverse().join('.')

/** Presentational list of flagged transactions; no data fetching */
export function UnusualList({ items, onDismiss, title = 'תנועות חריגות', subtitle, limit, footer }: Props) {
  const shown = limit ? items.slice(0, limit) : items
  return (
    <section dir="rtl" className="flex flex-col rounded-xl border bg-card p-4 sm:p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">לא נמצאו תנועות חריגות.</p>
        ) : (
          <ul className="-mx-2 flex flex-col divide-y divide-border/60">
            {shown.map(item => (
              <li key={`${item.source}:${item.id}`} className="flex items-start gap-3 px-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-medium">{item.description}</span>
                    {item.flags.map(f => (
                      <UnusualBadge key={f.reason} flag={f} />
                    ))}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {displayDate(item.date)} · {SOURCE_LABEL[item.source]}
                    {item.category ? ` · ${item.category}` : ''}
                  </p>
                  {item.flags.map(f => (
                    <p key={f.reason} className="text-xs text-muted-foreground text-pretty">
                      {unusualFlagDetail(f)}
                    </p>
                  ))}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[hsl(var(--expense))]">
                  {formatCurrency(item.amount)}
                </span>
                {onDismiss && (
                  <button
                    type="button"
                    onClick={() => onDismiss(item)}
                    aria-label="סמן כלא חריג"
                    title="סמן כלא חריג"
                    className="-m-1 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer}
    </section>
  )
}
