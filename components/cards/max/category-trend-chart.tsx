'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useTheme } from 'next-themes'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { OTHER_COLOR } from '@/lib/utils/category-colors'
import { cn } from '@/lib/utils/cn'
import type { CategoryMonthly } from '@/lib/insights/category-insights'

const TOP_N = 6
const OTHER = 'אחר'

interface Props {
  monthly: CategoryMonthly
  /** Categories ordered by yearly spend */
  ranked: string[]
  colors: Record<string, string>
  monthCount: number
  selectedMonth?: number
  selectedCategory?: string
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value)
  const total = rows.reduce((s: number, p: any) => s + p.value, 0)
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
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

function CategoryTrendChartInner({ monthly, ranked, colors, monthCount, selectedMonth, selectedCategory }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)

  // Top categories get their own series; a filtered category outside the top stays visible too
  const series = ranked.slice(0, TOP_N)
  if (selectedCategory && monthly[selectedCategory] && !series.includes(selectedCategory)) {
    series.push(selectedCategory)
  }
  const rest = ranked.filter(c => !series.includes(c))
  const keys = rest.length ? [...series, OTHER] : series

  const chartData = Array.from({ length: monthCount }, (_, i) => {
    const m = i + 1
    const row: Record<string, number | string> = { month: m, name: monthName(m) }
    for (const c of series) row[c] = monthly[c]?.[m] ?? 0
    if (rest.length) row[OTHER] = rest.reduce((s, c) => s + (monthly[c]?.[m] ?? 0), 0)
    return row
  })

  function navigate(update: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(params.toString())
    update(sp)
    router.push(`/cards/max?${sp.toString()}`)
  }

  const selectMonth = (m: number) => navigate(sp => sp.set('month', String(m)))
  const toggleCategory = (c: string) =>
    navigate(sp => (selectedCategory === c ? sp.delete('category') : sp.set('category', c)))

  const dimmed = (key: string, m: number) =>
    (selectedCategory !== undefined && key !== selectedCategory) ||
    (selectedMonth !== undefined && m !== selectedMonth)

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <h3 className="font-semibold text-base mb-0.5">הוצאות לפי קטגוריה לאורך השנה</h3>
      <p className="text-xs text-muted-foreground mb-3">לחץ על חודש לסינון, או על קטגוריה למטה</p>

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
              <Bar
                key={key}
                dataKey={key}
                stackId="cat"
                fill={key === OTHER ? OTHER_COLOR : colors[key]}
                maxBarSize={32}
                radius={i === keys.length - 1 ? [3, 3, 0, 0] : undefined}
              >
                {chartData.map(d => (
                  <Cell key={d.month as number} fillOpacity={dimmed(key, d.month as number) ? 0.25 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {keys.map(key => {
          const clickable = key !== OTHER
          const active = selectedCategory === key
          return (
            <li key={key}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && toggleCategory(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                  clickable && 'hover:bg-muted',
                  active ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-transparent text-muted-foreground',
                  selectedCategory && !active && 'opacity-60'
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: key === OTHER ? OTHER_COLOR : colors[key] }}
                  aria-hidden
                />
                {key}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function CategoryTrendChart(props: Props) {
  return (
    <Suspense fallback={<div className="rounded-lg border bg-card p-5 h-72 animate-pulse" />}>
      <CategoryTrendChartInner {...props} />
    </Suspense>
  )
}
