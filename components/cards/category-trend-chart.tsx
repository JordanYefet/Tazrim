'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useTheme } from 'next-themes'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { useStableData } from '@/hooks/use-stable-data'
import { OTHER_COLOR } from '@/lib/utils/category-colors'
import { cn } from '@/lib/utils/cn'
import type { CategoryMonthly } from '@/lib/insights/category-insights'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'

const TOP_N = 6
const OTHER = 'אחר'

interface Props {
  /** Page a month click filters (the category page itself) */
  basePath: string
  /** Where each category chip goes: the card's transactions filtered to it */
  categoryHrefs: Record<string, string>
  monthly: CategoryMonthly
  /** Categories ordered by yearly spend */
  ranked: string[]
  colors: Record<string, string>
  monthCount: number
  selectedMonth?: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value)
  const total = rows.reduce((s: number, p: any) => s + p.value, 0)
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {rows.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="ms-auto ps-3 font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
      <div className="mt-1 flex border-t pt-1 font-semibold">
        <span>סה״כ</span>
        <span className="ms-auto ps-3 tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  )
}

function CategoryTrendChartInner({ basePath, categoryHrefs, monthly, ranked, colors, monthCount, selectedMonth }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  // Top categories get their own series, the rest are grouped as "אחר"
  const series = ranked.slice(0, TOP_N)
  const rest = ranked.filter(c => !series.includes(c))
  const keys = rest.length ? [...series, OTHER] : series

  const rows = Array.from({ length: monthCount }, (_, i) => {
    const m = i + 1
    const row: Record<string, number | string> = { month: m, name: monthName(m) }
    for (const c of series) row[c] = monthly[c]?.[m] ?? 0
    if (rest.length) row[OTHER] = rest.reduce((s, c) => s + (monthly[c]?.[m] ?? 0), 0)
    return row
  })

  // A month click stays on this page and toggles the month
  function selectMonth(m: number) {
    const sp = new URLSearchParams(params.toString())
    if (selectedMonth === m) sp.delete('month')
    else sp.set('month', String(m))
    const qs = sp.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
  }

  const dimmed = (m: number) => selectedMonth !== undefined && m !== selectedMonth

  const chartData = useStableData(rows)

  return (
    <section className={SECTION}>
      <ChartHeader title="הוצאות לפי קטגוריה לאורך השנה" subtitle="לחיצה על חודש מסננת · קטגוריה פותחת את העסקאות שלה" />

      <div className="h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            onClick={e => e?.activePayload && selectMonth(e.activePayload[0].payload.month)}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
            <XAxis
              dataKey="name"
              {...axes.xAxis}
              tickFormatter={axes.monthTick}
              interval={axes.monthInterval(chartData.length)}
            />
            <YAxis {...axes.yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            {keys.map((key, i) => (
              <Bar {...anim}
                key={key}
                dataKey={key}
                stackId="cat"
                fill={key === OTHER ? OTHER_COLOR : colors[key]}
                maxBarSize={32}
                radius={i === keys.length - 1 ? [3, 3, 0, 0] : undefined}
              >
                {chartData.map(d => (
                  <Cell key={d.month as number} fillOpacity={dimmed(d.month as number) ? 0.25 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {keys.map(key => {
          const href = key === OTHER ? undefined : categoryHrefs[key]
          const chip = cn(
            'flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground',
            href && 'transition-colors hover:bg-muted hover:text-foreground'
          )
          const dot = (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: key === OTHER ? OTHER_COLOR : colors[key] }}
              aria-hidden
            />
          )
          return (
            <li key={key}>
              {href ? (
                <Link href={href} className={chip}>
                  {dot}
                  {key}
                </Link>
              ) : (
                <span className={chip}>
                  {dot}
                  {key}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function CategoryTrendChart(props: Props) {
  return (
    <Suspense fallback={<div className={`${SECTION} h-72 animate-pulse`} />}>
      <CategoryTrendChartInner {...props} />
    </Suspense>
  )
}
