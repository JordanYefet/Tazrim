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
 * How each category's expected spending moves over the coming months: a line per category,
 * the ones that peak highest shown at first, any other switched on or off with its chip. A tap
 * on the chart picks the month (as on the balance chart). Under it, a link to the recurring charges.
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
  const toggle = (name: string) => setShown(s => (s.includes(name) ? s.filter(n => n !== name) : [...s, name]))

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
      <div className="mb-4">
        <h2 className="text-base font-semibold">הוצאות צפויות לפי קטגוריה</h2>
        <p className="text-sm text-muted-foreground">כל קטגוריה בכל חודש. לחיצה על קטגוריה מוסיפה או מסתירה אותה</p>
      </div>

      <ul className="mb-4 flex flex-wrap gap-2" aria-label="קטגוריות בגרף">
        {names.map(name => {
          const on = shown.includes(name)
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(name)}
                className={cn(
                  'inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm ring-1 ring-inset transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'bg-muted text-foreground ring-transparent' : 'text-muted-foreground ring-border hover:text-foreground'
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', !on && 'opacity-50')} style={{ backgroundColor: colors[name] }} aria-hidden />
                <bdi>{name}</bdi>
              </button>
            </li>
          )
        })}
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
                  type="monotone"
                  name={name}
                  dataKey={(r: CategoryRow) => r.values[name]}
                  stroke={colors[name]}
                  strokeWidth={2.25}
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
