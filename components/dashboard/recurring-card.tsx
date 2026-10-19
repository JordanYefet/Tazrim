import Link from 'next/link'
import { ArrowLeft, ArrowUp, Repeat, Sparkles } from 'lucide-react'
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/currency'
import type { RecurringSeries } from '@/lib/insights/recurring'

interface Props {
  /** active subscriptions, biggest first (card payments and installments excluded) */
  series: (RecurringSeries & { status?: string | null })[]
  total: number
  limit?: number
}

/** Dashboard card: monthly recurring total plus the biggest few series. Pure props. */
export function RecurringCard({ series, total, limit = 4 }: Props) {
  const top = series.slice(0, limit)
  const flagged = series.filter(s => s.isNew || s.priceIncrease).length
  return (
    <section className="flex flex-col rounded-xl surface p-4 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-base font-semibold">
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            חיובים קבועים
          </h3>
          <p className="text-sm text-muted-foreground">
            {series.length} פעילים{flagged > 0 && ` · ${flagged} חדשים או שהתייקרו`}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <div className="text-lg font-semibold tabular-nums">{formatCurrencyWhole(total)}</div>
          <div className="text-xs text-muted-foreground">בחודש</div>
        </div>
      </div>

      {top.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground text-pretty">עדיין לא זוהו חיובים קבועים.</p>
      ) : (
        <ul className="-mx-2 flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-1 2xl:grid-cols-2">
          {top.map(s => (
            <li key={s.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.isNew && <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="חדש" />}
              {s.priceIncrease && <ArrowUp className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--expense))]" aria-label="התייקר" />}
              <span className="shrink-0 font-medium tabular-nums">{formatCurrency(s.latestAmount)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/recurring"
        className="mt-3 inline-flex items-center gap-1 self-start rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        לכל החיובים הקבועים
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  )
}
