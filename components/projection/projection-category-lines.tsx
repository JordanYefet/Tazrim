'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from 'next-themes'
import { SECTION } from '@/components/accounts/page-parts'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/currency'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { categorySeries, type CategoryRow } from '@/lib/insights/projection-rows'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { cn } from '@/lib/utils/cn'
import { useSelectedMonth } from './selected-month'
import { useEntranceOnce } from './use-entrance-once'
import { CategoryPicker } from './category-picker'
import { useChartAnimation } from '@/hooks/use-chart-animation'

/** Categories shown at first: the ones that peak highest */
export const DEFAULT_SHOWN = 5

function LinesTooltip({ active, payload, label, colors }: any) {
  if (!active || !payload?.length) return null
  const items = [...payload].sort((a: any, b: any) => b.value - a.value)
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {items.map((p: any) => (
        <p key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[p.name] }} aria-hidden />
            {p.name}
          </span>
          <span className="tabular-nums">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * How each category's expected spending moves over the coming months: a dashed line per
 * category (all of it is forecast), the ones that peak highest shown at first, any of them picked
 * in the categories pill. A line that is switched on draws in. A tap on the chart picks the month
 * (as on the balance chart). Under it, a link to the recurring charges.
 */
export function ProjectionCategoryLines({ months, recurring }: {
  months: ProjectedMonth[]
  recurring: { count: number; monthly: number }
}) {
  // From the first full month: the first forecast row is the rest of the latest data month,
  // which would draw every category climbing from what is already paid
  const { names, rows } = useMemo(() => categorySeries(months.slice(1)), [months])
  const colors = useMemo(() => categoryColorMap(names), [names])
  const [shown, setShown] = useState<string[]>(() => names.slice(0, DEFAULT_SHOWN))
  // Lines switched on draw in (the others stay put: the chart's entrance has played once)
  const [fresh, setFresh] = useState<string[]>([])
  const motion = useChartAnimation()
  const change = (next: string[]) => {
    const added = next.filter(n => !shown.includes(n))
    setShown(next)
    if (added.length && motion.isAnimationActive) {
      setFresh(added)
      window.setTimeout(() => setFresh(f => f.filter(n => !added.includes(n))), motion.animationDuration + 100)
    }
  }

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  // The same axis colours as the other charts (docs/design-system.md, Known gaps)
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  const anim = useEntranceOnce()

  const { month: selected, select } = useSelectedMonth()
  const selectedLabel = rows.find(r => r.month === selected)?.label
  const pick = (state: { activeLabel?: string | number } | null) => {
    const row = rows.find(r => r.label === state?.activeLabel)
    if (row) select(row.month === selected ? null : row.month)
  }

  return (
    <section className={cn(SECTION, 'min-w-0')}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-base font-semibold">הוצאות צפויות לפי קטגוריה</h2>
          <p className="text-sm text-muted-foreground">כל קטגוריה בכל חודש: אחת, כמה או כולן</p>
        </div>
        <CategoryPicker names={names} colors={colors} shown={shown} onChange={change} />
      </div>
      {/* Which line is which: the categories shown, in their colours */}
      <ul className="mb-4 flex min-h-5 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="קטגוריות בגרף">
        {names
          .filter(name => shown.includes(name))
          .map(name => (
            <li key={name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[name] }} aria-hidden />
              <bdi>{name}</bdi>
            </li>
          ))}
      </ul>

      <div dir="ltr" className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={axes.margin} onClick={pick} style={{ cursor: 'pointer' }}>
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
            <XAxis dataKey="label" {...axes.xAxis} interval="preserveStartEnd" />
            <YAxis {...axes.yAxis} />
            <Tooltip content={<LinesTooltip colors={colors} />} />
            {selectedLabel && <ReferenceLine x={selectedLabel} stroke="var(--chart-1)" strokeOpacity={0.15} strokeWidth={16} />}
            {names
              .filter(name => shown.includes(name))
              .map(name => (
                <Line
                  key={name}
                  {...anim}
                  isAnimationActive={anim.isAnimationActive || fresh.includes(name)}
                  type="monotone"
                  name={name}
                  dataKey={(r: CategoryRow) => r.values[name]}
                  stroke={colors[name]}
                  strokeWidth={2.25}
                  strokeDasharray="6 5"
                  dot={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {recurring.count > 0 && (
        <Link href="/recurring" className="mt-4 inline-block text-sm text-primary hover:underline">
          {recurring.count} חיובים קבועים בתחזית, {formatCurrencyWhole(recurring.monthly)} בחודש. חיוב שהסתיים מסמנים בחיובים קבועים
        </Link>
      )}
    </section>
  )
}
