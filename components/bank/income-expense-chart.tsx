'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Customized } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { EmptyMonthSlots, EmptyMonthTooltip, clickedMonth, isEmptyMonthPayload } from '@/components/ui/month-slots'
import { yearChartRows } from '@/lib/insights/chart-months'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { useStableData } from '@/hooks/use-stable-data'
import { accountPath } from '@/lib/accounts/routes'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'
import { toggleMonthQuery, withQueryString } from '@/lib/utils/month-param'

interface MonthData { month: number; income: number; expense: number }

interface Props {
  data: MonthData[]
  selectedMonth?: number
  /** One bank account; omitted on the /banks overview (every account) */
  accountId?: string
  subtitle?: string
  /** Only the income (IN) or expense (OUT) bars */
  flow?: 'IN' | 'OUT'
}

// HTML legend instead of Recharts' <Legend>, which drew cramped dark squares in RTL (ENG-11)
const LEGEND = [
  { label: 'הכנסות', color: 'var(--chart-income)' },
  { label: 'הוצאות', color: 'var(--chart-expense)' },
]

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

function IncomeExpenseChartInner({ data, selectedMonth, accountId, subtitle, flow }: Props) {
  const showIncome = flow !== 'OUT'
  const showExpense = flow !== 'IN'
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const incomeColor = isDark ? 'var(--chart-income, #3aad76)' : 'var(--chart-income, #2e8a5e)'
  const expenseColor = isDark ? 'var(--chart-expense, #e05c52)' : 'var(--chart-expense, #d94040)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  // January to December; months without income or expenses are empty slots (ENG-70)
  const byMonth = new Map(data.map(d => [d.month, d]))
  const rows = yearChartRows(['הכנסות', 'הוצאות'] as const, (m, key) =>
    key === 'הכנסות' ? byMonth.get(m)?.income : byMonth.get(m)?.expense
  )

  function handleClick(month: number | undefined) {
    if (!month) return
    router.push(withQueryString(accountPath('BANK', accountId), toggleMonthQuery(params.toString(), month)), {
      scroll: false,
    })
  }

  const chartData = useStableData(rows)

  return (
    <section className={SECTION}>
      <ChartHeader
        title={flow === 'IN' ? 'הכנסות' : flow === 'OUT' ? 'הוצאות' : 'הכנסות מול הוצאות'}
        subtitle={subtitle ?? 'לחיצה על חודש מסננת'}
        legend={LEGEND.filter((_, i) => (i === 0 ? showIncome : showExpense))}
      />
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            onClick={e => handleClick(clickedMonth(e))}
            barGap={2}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
            <XAxis
              dataKey="name"
              {...axes.xAxis}
              {...axes.monthAxis(chartData.length, selectedMonth)}
            />
            <YAxis {...axes.yAxis} />
            <Customized component={<EmptyMonthSlots selectedMonth={selectedMonth} maxWidth={42} />} />
            <Tooltip filterNull={false} content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            {showIncome && (
              <Bar {...anim} dataKey="הכנסות" fill={incomeColor} radius={[3, 3, 0, 0]} maxBarSize={20}>
                {chartData.map(entry => (
                  <Cell
                    key={entry.month}
                    fillOpacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.3}
                  />
                ))}
              </Bar>
            )}
            {showExpense && (
              <Bar {...anim} dataKey="הוצאות" fill={expenseColor} radius={[3, 3, 0, 0]} maxBarSize={20}>
                {chartData.map(entry => (
                  <Cell
                    key={entry.month}
                    fillOpacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.3}
                  />
                ))}
              </Bar>
            )}
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
