import Link from 'next/link'
import { Pencil, TriangleAlert } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { SECTION } from '@/components/accounts/page-parts'
import { monthLabel, tightLine } from '@/lib/insights/projection-format'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { cn } from '@/lib/utils/cn'
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

/** One fact row: the label (and any note or link) at the start, the number alone at the end, so the numbers line up */
function Fact({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

/**
 * The top row, two equal halves like the other pages: the hero (the expected balance in 12
 * months, its range, the tight months and a few facts with the cushion shortcut) beside the chart.
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
  const fresh = months.filter(m => !m.stale)
  const lowest = (fresh.length ? fresh : months).reduce((a, m) => (m.expected < a.expected ? m : a))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface-hero flex flex-col rounded-xl p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">בעוד 12 חודשים</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums sm:text-[2.75rem]"><RollingNumber value={end.expected} /></p>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          בין <RollingNumber value={end.low} /> ל-<RollingNumber value={end.high} />
        </p>
        {/* Reserved: the row is there whether or not a month is tight (stable layout) */}
        <p
          data-tight-line
          aria-hidden={!line || undefined}
          className={cn('mt-3 flex min-h-5 items-center gap-1.5 text-sm text-[hsl(var(--expense))]', !line && 'invisible')}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {line ?? '—'}
        </p>
        <div className="mt-auto pt-4">
          <Fact label="היום"><RollingNumber value={start} /></Fact>
          <Fact label="שינוי בשנה">
            <span className={change >= 0 ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'} dir="ltr">
              {change >= 0 ? '+' : '−'}<RollingNumber value={Math.abs(change)} />
            </span>
          </Fact>
          <Fact label={<>החודש הנמוך <span className="text-xs">{monthLabel(lowest.month)}</span></>}>
            <RollingNumber value={lowest.expected} />
          </Fact>
          <Fact
            label={
              <Link
                href="/settings#projection"
                className="inline-flex items-center gap-1.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="שינוי הכרית בהגדרות"
              >
                כרית ביטחון
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          >
            <RollingNumber value={cushion} />
          </Fact>
        </div>
      </section>

      <section className={cn(SECTION, 'flex min-w-0 flex-col')}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 className="text-base font-semibold">יתרה צפויה</h2>
          <Legend />
        </div>
        <div className="mt-auto">
          <ProjectionChart past={past} months={months} start={start} cushion={cushion} />
        </div>
      </section>
    </div>
  )
}
