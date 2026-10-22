'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Customized } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { EmptyMonthSlots, EmptyMonthTooltip, clickedMonth, isEmptyMonthPayload } from '@/components/ui/month-slots'
import { yearChartRows } from '@/lib/insights/chart-months'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { useStableData } from '@/hooks/use-stable-data'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { toggleMonthQuery, withQueryString } from '@/lib/utils/month-param'

interface Props {
  bankSummary: Record<number, { income: number; expense: number }>
  /** Card charges, all active cards summed (a breakdown of the bank spending) */
  maxSummary: Record<number, number>
  /** Card name for the legend: the card's name, or a generic one with several cards */
  cardsName?: string
  selectedMonth?: number
}

function chartColors(isDark: boolean) {
  return {
    income: isDark ? 'var(--chart-income, #3aad76)' : 'var(--chart-income, #2e8a5e)',
    expense: isDark ? 'var(--chart-expense, #e05c52)' : 'var(--chart-expense, #d94040)',
    cc: isDark ? 'var(--chart-cc, #d4955a)' : 'var(--chart-cc, #b8732a)',
    text: isDark ? '#8a9ab0' : '#607080',
    grid: isDark ? '#283040' : '#e2e8ed',
  }
}

function seriesFor(cardsName: string) {
  return [
    { key: 'הכנסות בנק', color: 'income' },
    { key: 'הוצאות בנק', color: 'expense' },
    { key: `חיובי ${cardsName}`, color: 'cc' },
  ] as const
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  if (isEmptyMonthPayload(payload)) return <EmptyMonthTooltip label={label} />
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function CombinedChartInner({ bankSummary, maxSummary, cardsName = 'מקס', selectedMonth }: Props) {
  const SERIES = seriesFor(cardsName)
  const ccKey = SERIES[2].key
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const c = chartColors(isDark)
  const axes = useChartAxes(c.text)
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  // January to December; months with no bank or card values are empty slots (ENG-70)
  const rows = yearChartRows(
    SERIES.map(s => s.key),
    (m, key) =>
      key === 'הכנסות בנק' ? bankSummary[m]?.income : key === 'הוצאות בנק' ? bankSummary[m]?.expense : maxSummary[m]
  )

  function handleClick(month: number | undefined) {
    if (!month) return
    router.push(withQueryString('/', toggleMonthQuery(params.toString(), month)), { scroll: false })
  }

  const chartData = useStableData(rows)

  return (
    <section className="rounded-xl surface p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="font-semibold text-base">סיכום חודשי</h3>
          <p className="text-sm text-muted-foreground">{`${ccKey} כלולים בהוצאות הבנק · לחיצה על חודש מסננת`}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SERIES.map(s => (
            <li key={s.key} className="flex items-center gap-1.5">
              {/* CSS var (not the JS theme) so SSR and client markup match */}
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--chart-${s.color})` }} aria-hidden />
              {s.key}
            </li>
          ))}
        </ul>
      </div>
      <div className="h-52 sm:h-64 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            barGap={2}
            onClick={e => handleClick(clickedMonth(e))}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 4" />
            <XAxis
              dataKey="name"
              {...axes.xAxis}
              {...axes.monthAxis(chartData.length, selectedMonth)}
            />
            <YAxis {...axes.yAxis} />
            <Customized component={<EmptyMonthSlots selectedMonth={selectedMonth} maxWidth={58} />} />
            <Tooltip filterNull={false} content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            {SERIES.map(s => (
              <Bar {...anim} key={s.key} dataKey={s.key} fill={c[s.color]} radius={[3, 3, 0, 0]} maxBarSize={18}>
                {chartData.map(d => (
                  <Cell
                    key={d.month}
                    fillOpacity={selectedMonth && d.month !== selectedMonth ? 0.3 : 1}
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

export function CombinedChart(props: Props) {
  return (
    <Suspense fallback={<div className="rounded-xl surface p-5 h-52 sm:h-64 md:h-80 animate-pulse" />}>
      <CombinedChartInner {...props} />
    </Suspense>
  )
}
