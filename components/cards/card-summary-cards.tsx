import { RollingNumber } from '@/components/ui/rolling-number'
import { StatGrid, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  total: number
  count: number
  average?: number
  /** Hero label, e.g. a category filter */
  label?: string
  /** Extra tiles after count and average (the overview adds the number of cards) */
  extra?: StatDef[]
}

/**
 * Hero charge total plus quieter tiles, as on the dashboard. The charges are
 * paid from the bank, so they are already inside the bank expenses.
 */
export function CardSummaryCards({ total, count, average, label = 'סה״כ חיובים', extra = [] }: Props) {
  const stats: StatDef[] = [
    { label: 'מספר עסקאות', value: count, tone: 'neutral', format: 'integer' },
    ...(average !== undefined
      ? [{ label: 'ממוצע חודשי', value: average, tone: 'cc' as const, format: 'currencyExact' as const }]
      : []),
    ...extra,
  ]

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section aria-label={label} className="flex flex-col justify-between gap-6 rounded-xl border bg-card p-5 sm:p-6">
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
