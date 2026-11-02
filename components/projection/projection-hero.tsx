import Link from 'next/link'
import { SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { tightLine } from '@/lib/insights/projection-format'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { ProjectionChart } from './projection-chart'

const SWATCH = 'h-0 w-5 shrink-0 border-t-2'

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5"><span className={SWATCH} style={{ borderColor: 'var(--chart-1)' }} aria-hidden />בפועל</li>
      <li className="flex items-center gap-1.5"><span className={`${SWATCH} border-dashed`} style={{ borderColor: 'var(--chart-1)' }} aria-hidden />צפוי</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 shrink-0 rounded-sm" style={{ backgroundColor: 'var(--chart-1)', opacity: 0.2 }} aria-hidden />טווח</li>
      <li className="flex items-center gap-1.5"><span className={`${SWATCH} border-dotted border-muted-foreground`} aria-hidden />כרית</li>
    </ul>
  )
}

/**
 * The page's one hero card: the expected balance in 12 months with its range and tight months,
 * the cushion shortcut and legend at the end, and the chart below. On phones the legend and
 * shortcut move under the chart.
 */
export function ProjectionHero({ past, months, start, end, tight, cushion }: {
  past: { month: string; balance: number }[]
  months: ProjectedMonth[]
  start: number
  end: ProjectedMonth
  tight: ProjectedMonth[]
  cushion: number
}) {
  const change = end.expected - start
  const line = tightLine(tight)
  return (
    <section className="surface-hero grid gap-x-6 gap-y-4 rounded-xl p-4 sm:grid-cols-[1fr_auto] sm:p-6">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">בעוד 12 חודשים</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums sm:text-[2.75rem]"><RollingNumber value={end.expected} /></p>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          בין {formatCurrencyWhole(end.low)} ל-{formatCurrencyWhole(end.high)} ·{' '}
          <span className={change >= 0 ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'}>
            {change >= 0 ? '+' : '−'}{formatCurrencyWhole(Math.abs(change))}
          </span>{' '}מהיום
        </p>
        {/* Reserved: the row is there whether or not a month is tight (stable layout) */}
        <p
          data-tight-line
          aria-hidden={!line || undefined}
          className={`mt-3 flex min-h-5 items-center gap-1.5 text-sm text-[hsl(var(--expense))] ${line ? '' : 'invisible'}`}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {line ?? '—'}
        </p>
      </div>

      <div className="order-3 flex flex-wrap items-center gap-x-4 gap-y-2 sm:order-2 sm:flex-col sm:items-end">
        <Link
          href="/settings#projection"
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          כרית ביטחון · {formatCurrencyWhole(cushion)}
        </Link>
        <Legend />
      </div>

      <div className="order-2 min-w-0 sm:order-3 sm:col-span-2">
        <ProjectionChart past={past} months={months} start={start} cushion={cushion} />
      </div>
    </section>
  )
}
