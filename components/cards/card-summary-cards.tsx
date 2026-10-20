import type { ReactNode } from 'react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { averageStat, StatGrid, StatTile, type StatDef } from '@/components/dashboard/summary-cards'

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
  /**
   * The card itself as one tile of the grid (a card's page, ENG-56): next to
   * the total on phones, one tile of the stats row on wide screens.
   */
  card?: ReactNode
}

/**
 * Hero charge total plus quieter tiles, as on the dashboard. The charges are
 * paid from the bank, so they are already inside the bank expenses.
 */
export function CardSummaryCards({ total, count, average, monthLabel, label = 'סה״כ חיובים', extra = [], card }: Props) {
  const stats: StatDef[] = [
    { label: 'מספר עסקאות', value: count, tone: 'neutral', format: 'integer' },
    averageStat(
      { label: 'ממוצע חודשי', tone: 'cc', format: 'currencyExact' },
      average,
      monthLabel ? { label: monthLabel, value: total } : undefined
    ),
    ...extra,
  ]

  if (card) {
    return (
      // Phones: [total | card] then [count | average]. Wide: one row in that order.
      <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label={label} className="flex min-w-0 flex-col justify-between gap-3 rounded-xl surface-hero p-4 sm:p-5">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums text-[hsl(var(--cc))] sm:text-3xl xl:text-[2.5rem] xl:leading-none">
            <RollingNumber value={total} duration={800} format="currencyExact" />
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--cc))]" aria-hidden />
            <span className="min-w-0">כבר כלול בהוצאות הבנק</span>
          </p>
        </section>
        <div className="self-center">{card}</div>
        {stats.map(s => (
          <StatTile key={s.label} {...s} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section aria-label={label} className="flex flex-col justify-between gap-6 rounded-xl surface-hero p-4 sm:p-6">
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
