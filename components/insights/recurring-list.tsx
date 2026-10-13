import type { ReactNode } from 'react'
import { ArrowUp, CreditCard, Landmark, Repeat, Sparkles } from 'lucide-react'
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import type { Cadence, RecurringSeries } from '@/lib/insights/recurring'

interface Props {
  series: RecurringSeries[]
  /** Monthly total, from `recurringMonthlyTotal` — computed by the caller so it controls sources/dismissals */
  total: number
  title?: string
  /** Per-row slot for confirm/dismiss/rename controls (phase 2) */
  actions?: (series: RecurringSeries) => ReactNode
  className?: string
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'שבועי',
  monthly: 'חודשי',
  yearly: 'שנתי',
}

const badge = 'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium'

function Row({ s, actions }: { s: RecurringSeries; actions?: Props['actions'] }) {
  const SourceIcon = s.source === 'bank' ? Landmark : CreditCard
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
      <SourceIcon
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-label={s.source === 'bank' ? 'בנק' : 'כרטיס אשראי'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium" title={s.name}>
            {s.name}
          </span>
          {s.isNew && (
            <span className={cn(badge, 'bg-primary/10 text-primary')}>
              <Sparkles className="h-3 w-3" aria-hidden />
              חדש
            </span>
          )}
          {s.priceIncrease && (
            <span
              className={cn(badge, 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))] tabular-nums')}
              title={`עלה מ-${formatCurrency(s.priceIncrease.from)} ל-${formatCurrency(s.priceIncrease.to)}`}
            >
              <ArrowUp className="h-3 w-3" aria-hidden />
              התייקר
            </span>
          )}
          {!s.active && <span className={cn(badge, 'bg-muted text-muted-foreground')}>הופסק?</span>}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {CADENCE_LABEL[s.cadence]} · {s.occurrences} חיובים · אחרון {formatDate(s.lastDate)}
          {s.active && <> · הבא בערך {formatDate(s.nextDate)}</>}
        </p>
      </div>
      <div className="shrink-0 text-end tabular-nums">
        <div className="font-semibold">{formatCurrency(s.latestAmount)}</div>
        {s.priceIncrease && (
          <div className="text-xs text-muted-foreground line-through">{formatCurrency(s.priceIncrease.from)}</div>
        )}
      </div>
      {actions && <div className="shrink-0">{actions(s)}</div>}
    </li>
  )
}

/** Presentational list of recurring charges. Pure props, no data access. */
export function RecurringList({ series, total, title = 'חיובים קבועים', actions, className }: Props) {
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card p-4 sm:p-6', className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-semibold">
            <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden />
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">מנויים וחיובים שחוזרים כל חודש</p>
        </div>
        <div className="text-end">
          <div className="text-lg font-semibold tabular-nums">{formatCurrencyWhole(total)}</div>
          <div className="text-xs text-muted-foreground">בחודש</div>
        </div>
      </div>

      {series.length === 0 ? (
        <p className="my-auto py-6 text-center text-sm text-muted-foreground text-pretty">
          עדיין לא זוהו חיובים קבועים. צריך לפחות שלושה חיובים דומים בהפרש של חודש.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {series.map(s => (
            <Row key={s.key} s={s} actions={actions} />
          ))}
        </ul>
      )}
    </section>
  )
}
