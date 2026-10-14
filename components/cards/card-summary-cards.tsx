import { RollingNumber } from '@/components/ui/rolling-number'
import { averageStat, StatGrid, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  total: number
  count: number
  /** Yearly monthly average (of the filtered category, when there is one) */
  average: number
  /** The selected month's name: its total is compared with the average */
  monthLabel?: string
  /** Hero label, e.g. a category filter */
  label?: string
  /** Extra tiles after count and average (the overview adds the number of cards) */
  extra?: StatDef[]
}

/**
 * Hero charge total plus quieter tiles, as on the dashboard. The charges are
 * paid from the bank, so they are already inside the bank expenses.
 */
export function CardSummaryCards({ total, count, average, monthLabel, label = 'סה״כ חיובים', extra = [] }: Props) {
  const stats: StatDef[] = [
    { label: 'מספר עסקאות', value: count, tone: 'neutral', format: 'integer' },
    averageStat(
      { label: 'ממוצע חודשי', tone: 'cc', format: 'currencyExact' },
      average,
      monthLabel ? { label: monthLabel, value: total } : undefined
    ),
    ...extra,
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section aria-label={label} className="flex flex-col justify-between gap-6 rounded-xl border bg-card p-4 sm:p-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-[hsl(var(--cc))] sm:text-[2.75rem] sm:leading-none">
            <RollingNumber value={total} duration={800} format="currencyExact" />
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--cc))]" aria-hidden />
          נגבה מחשבון הבנק, ולכן כבר כלול בהוצאות הבנק
        </p>
      </section>
      <StatGrid stats={stats} />
    </div>
  )
}
