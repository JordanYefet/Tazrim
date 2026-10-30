import type { ReactNode } from 'react'
import { ArrowUp, BadgeCheck, CreditCard, Landmark, Repeat, Sparkles } from 'lucide-react'
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import type { Cadence, RecurringSeries } from '@/lib/insights/recurring'
import type { ManualInfo } from '@/lib/insights/manual-recurring'

export type RecurringListItem = RecurringSeries & {
  status?: 'confirmed' | 'dismissed' | null
  detectedName?: string
  /** a series the user defined by hand (ENG-71) */
  manual?: ManualInfo
}

interface Props {
  series: RecurringListItem[]
  /** Monthly total shown in the header, computed by the caller; omitted = no total */
  total?: number
  title?: string
  subtitle?: string
  emptyText?: string
  /** account id → name; shown on each row when given */
  accountNames?: Record<string, string>
  /** Per-row slot for confirm/dismiss/rename controls */
  actions?: (series: RecurringListItem) => ReactNode
  /** Wraps each row's content, e.g. in a button that opens the series' window (/recurring) */
  wrapRow?: (series: RecurringListItem, content: ReactNode) => ReactNode
  className?: string
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'שבועי',
  monthly: 'חודשי',
  bimonthly: 'דו-חודשי',
  yearly: 'שנתי',
}

const badge = 'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium'

function Row({ s, actions, wrapRow, accountNames }: {
  s: RecurringListItem
  actions?: Props['actions']
  wrapRow?: Props['wrapRow']
  accountNames?: Props['accountNames']
}) {
  const SourceIcon = s.source === 'bank' ? Landmark : CreditCard
  const account = s.accountId ? accountNames?.[s.accountId] : undefined
  const renamed = s.detectedName && s.detectedName !== s.name
  const content = (
    <>
      <SourceIcon
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-label={s.source === 'bank' ? 'בנק' : 'כרטיס אשראי'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium" title={renamed ? `${s.name} (${s.detectedName})` : s.name}>
            {s.name}
          </span>
          {s.status === 'confirmed' && (
            <BadgeCheck className="h-4 w-4 shrink-0 text-[hsl(var(--income))]" aria-label="מאושר" />
          )}
          {s.isNew && (
            <span className={cn(badge, 'bg-primary/10 text-primary')}>
              <Sparkles className="h-3 w-3" aria-hidden />
              חדש
            </span>
          )}
          {s.priceIncrease && (
            <span
              className={cn(badge, 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))] tabular-nums')}
              title={`עלה מ-${formatCurrency(s.priceIncrease.from)} ל-${formatCurrency(s.priceIncrease.to)} החל מ-${formatDate(s.priceIncrease.since)}`}
            >
              <ArrowUp className="h-3 w-3" aria-hidden />
              התייקר
            </span>
          )}
          {s.manual && (
            <span className={cn(badge, 'bg-muted text-muted-foreground')} title="חיוב קבוע שהוגדר ידנית">
              ידני
            </span>
          )}
          {s.isInstallment && <span className={cn(badge, 'bg-muted text-muted-foreground')}>תשלומים</span>}
          {!s.active && s.occurrences > 0 && <span className={cn(badge, 'bg-muted text-muted-foreground')}>הופסק?</span>}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {s.occurrences > 0 ? (
            <>
              {CADENCE_LABEL[s.cadence]} · {s.occurrences} חיובים · אחרון {formatDate(s.lastDate)}
              {s.active && <> · הבא בערך {formatDate(s.nextDate)}</>}
            </>
          ) : (
            <>{CADENCE_LABEL[s.cadence]} · אין תנועות תואמות</>
          )}
          {account && <> · {account}</>}
        </p>
      </div>
      <div className="shrink-0 text-end tabular-nums">
        <div className="font-semibold">{formatCurrency(s.latestAmount)}</div>
        {s.priceIncrease && (
          <div className="text-xs text-muted-foreground line-through">{formatCurrency(s.priceIncrease.from)}</div>
        )}
      </div>
    </>
  )
  if (wrapRow) return <li>{wrapRow(s, content)}</li>
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-muted/50">
      {content}
      {actions && (
        // own line on phones, inline from sm up
        <div className="flex basis-full justify-end sm:basis-auto">{actions(s)}</div>
      )}
    </li>
  )
}

/** Presentational list of recurring charges. Pure props, no data access. */
export function RecurringList({
  series,
  total,
  title = 'חיובים קבועים',
  subtitle = 'מנויים וחיובים שחוזרים כל חודש',
  emptyText = 'עדיין לא זוהו חיובים קבועים. צריך לפחות שלושה חיובים דומים בהפרש של חודש.',
  accountNames,
  actions,
  wrapRow,
  className,
}: Props) {
  return (
    <section className={cn('flex flex-col rounded-xl surface p-4 sm:p-6', className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-base font-semibold">
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {title}
          </h3>
          {subtitle && <p className="text-sm text-muted-foreground text-pretty">{subtitle}</p>}
        </div>
        {total !== undefined && (
          <div className="shrink-0 text-end">
            <div className="text-lg font-semibold tabular-nums">{formatCurrencyWhole(total)}</div>
            <div className="text-xs text-muted-foreground">בחודש</div>
          </div>
        )}
      </div>

      {series.length === 0 ? (
        <p className="my-auto py-6 text-center text-sm text-muted-foreground text-pretty">{emptyText}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {series.map(s => (
            <Row key={s.key} s={s} actions={actions} wrapRow={wrapRow} accountNames={accountNames} />
          ))}
        </ul>
      )}
    </section>
  )
}
