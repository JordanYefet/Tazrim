'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { useStableData } from '@/hooks/use-stable-data'
import { accountPath } from '@/lib/accounts/routes'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'
import { toggleMonthQuery, withQueryString } from '@/lib/utils/month-param'

export interface SpendingSeries {
  /** Unique key (the card's account id) */
  key: string
  label: string
  /** CSS color, a CSS var so server and client markup match */
  color: string
  /** month (1-12) -> charged */
  data: Record<string, number>
}

interface Props {
  /** One series per card; several are stacked */
  series: SpendingSeries[]
  selectedMonth?: number
  /** One card; omitted on the /cards overview */
  accountId?: string
  /** Number of months (from January) to plot */
  monthCount?: number
  title?: string
  subtitle?: string
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p: any) => p.value > 0)
  const total = rows.reduce((s: number, p: any) => s + p.value, 0)
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      {payload.length === 1 ? (
        <p className="text-[hsl(var(--cc))] font-medium tabular-nums">{formatCurrency(payload[0].value)}</p>
      ) : (
        <>
          {rows.map((p: any) => (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-muted-foreground">{p.name}:</span>
              <span className="ms-auto ps-3 font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
            </div>
          ))}
          <div className="mt-1 flex border-t pt-1 font-semibold">
            <span>סה״כ</span>
            <span className="ms-auto ps-3 tabular-nums">{formatCurrency(total)}</span>
          </div>
        </>
      )}
    </div>
  )
}

function MonthlySpendingChartInner({
  series,
  selectedMonth,
  accountId,
  monthCount = 12,
  title = 'חיובים חודשיים',
  subtitle = 'לחיצה על חודש מסננת',
}: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  const rows = Array.from({ length: monthCount }, (_, i) => {
    const m = i + 1
    const row: Record<string, number | string> = { month: m, name: monthName(m) }
    for (const s of series) row[s.key] = s.data[String(m)] ?? 0
    return row
  })

  function handleClick(entry: { month: number }) {
    router.push(
      withQueryString(accountPath('CREDIT_CARD', accountId), toggleMonthQuery(params.toString(), entry.month)),
      { scroll: false }
    )
  }

  const chartData = useStableData(rows)

  return (
    <section className={SECTION}>
      <ChartHeader
        title={title}
        subtitle={subtitle}
        legend={series.length > 1 ? series.map(s => ({ label: s.label, color: s.color })) : undefined}
      />
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            onClick={e => e?.activePayload && handleClick(e.activePayload[0].payload)}
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
            {series.map((s, i) => (
              <Bar {...anim}
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="cards"
                fill={s.color}
                maxBarSize={28}
                radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined}
              >
                {chartData.map(d => (
                  <Cell
                    key={d.month as number}
                    fillOpacity={!selectedMonth || selectedMonth === d.month ? 1 : 0.3}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function MonthlySpendingChart(props: Props) {
  return (
    <Suspense fallback={<div className={`${SECTION} h-64 animate-pulse`} />}>
      <MonthlySpendingChartInner {...props} />
    </Suspense>
  )
}
