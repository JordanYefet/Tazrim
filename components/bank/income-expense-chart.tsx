'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { accountPath } from '@/lib/accounts/routes'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'

interface MonthData { month: number; income: number; expense: number }

interface Props {
  data: MonthData[]
  selectedMonth?: number
  /** One bank account; omitted on the /banks overview (every account) */
  accountId?: string
  /** Number of months (from January) to plot */
  monthCount?: number
  subtitle?: string
}

// HTML legend instead of Recharts' <Legend>, which drew cramped dark squares in RTL (ENG-11)
const LEGEND = [
  { label: 'הכנסות', color: 'var(--chart-income)' },
  { label: 'הוצאות', color: 'var(--chart-expense)' },
]

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
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

function IncomeExpenseChartInner({ data, selectedMonth, accountId, monthCount = 12, subtitle }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const incomeColor = isDark ? 'var(--chart-income, #3aad76)' : 'var(--chart-income, #2e8a5e)'
  const expenseColor = isDark ? 'var(--chart-expense, #e05c52)' : 'var(--chart-expense, #d94040)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)

  const chartData = data
    .filter(d => d.month <= monthCount)
    .map(d => ({
      month: d.month,
      name: monthName(d.month),
      'הכנסות': d.income,
      'הוצאות': d.expense,
    }))

  function handleClick(entry: { month: number }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('month', String(entry.month))
    router.push(`${accountPath('BANK', accountId)}?${sp.toString()}`)
  }

  return (
    <section className={SECTION}>
      <ChartHeader
        title="הכנסות מול הוצאות"
        subtitle={subtitle ?? 'לחיצה על חודש מסננת'}
        legend={LEGEND}
      />
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            onClick={e => e?.activePayload && handleClick(e.activePayload[0].payload)}
            barGap={2}
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
            <Bar dataKey="הכנסות" fill={incomeColor} radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map(entry => (
                <Cell
                  key={entry.month}
                  fillOpacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.3}
                />
              ))}
            </Bar>
            <Bar dataKey="הוצאות" fill={expenseColor} radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map(entry => (
                <Cell
                  key={entry.month}
                  fillOpacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function IncomeExpenseChart(props: Props) {
  return (
    <Suspense fallback={<div className={`${SECTION} h-72 animate-pulse`} />}>
      <IncomeExpenseChartInner {...props} />
    </Suspense>
  )
}
