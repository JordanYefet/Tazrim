import { SECTION } from '@/components/accounts/page-parts'
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

/** The balance timeline: the actual balance, the forecast in its band; a tap picks a month for the hero and the category lines */
export function ProjectionChartCard({ past, months, start, cushion, seasonal }: {
  past: { month: string; balance: number }[]
  months: ProjectedMonth[]
  start: number
  cushion: number
  seasonal: boolean
}) {
  return (
    <section className={cn(SECTION, 'min-w-0')}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-base font-semibold">יתרה צפויה</h2>
          <p className="text-sm text-muted-foreground">
            {seasonal ? 'כל חודש לפי מה שהיה בו בשנים הקודמות' : 'חודש רגיל בכל חודש: עונתיות מצריכה שנה של היסטוריה'}
            {' · '}לחיצה על חודש מציגה אותו
          </p>
        </div>
        <Legend />
      </div>
      <ProjectionChart past={past} months={months} start={start} cushion={cushion} />
    </section>
  )
}
