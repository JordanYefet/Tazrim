'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'

interface MonthData { month: number; income: number; expense: number }

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function IncomeExpenseChart({ data, selectedMonth }: { data: MonthData[]; selectedMonth?: number }) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const incomeColor = isDark ? 'var(--chart-income, #3aad76)' : 'var(--chart-income, #2e8a5e)'
  const expenseColor = isDark ? 'var(--chart-expense, #e05c52)' : 'var(--chart-expense, #d94040)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const axes = useChartAxes(textColor)

  const chartData = data.map(d => ({
    month: d.month,
    name: monthName(d.month),
    'הכנסות': d.income,
    'הוצאות': d.expense,
  }))

  function handleClick(entry: { month: number }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('month', String(entry.month))
    router.push(`/bank?${sp.toString()}`)
  }

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <h3 className="font-semibold text-base mb-0.5">הכנסות מול הוצאות</h3>
      <p className="text-xs text-muted-foreground mb-4">לחץ על חודש לסינון</p>
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            onClick={e => e?.activePayload && handleClick(e.activePayload[0].payload)}
            barGap={2}
          >
            <XAxis
              dataKey="name"
              {...axes.xAxis}
              tickFormatter={axes.monthTick}
              interval={axes.monthInterval(chartData.length)}
            />
            <YAxis {...axes.yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Heebo', paddingTop: 12 }} iconType="square" iconSize={8} />
            <Bar dataKey="הכנסות" radius={[3, 3, 0, 0]} maxBarSize={20} cursor="pointer">
              {chartData.map(entry => (
                <Cell
                  key={entry.month}
                  fill={incomeColor}
                  opacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.3}
                />
              ))}
            </Bar>
            <Bar dataKey="הוצאות" radius={[3, 3, 0, 0]} maxBarSize={20} cursor="pointer">
              {chartData.map(entry => (
                <Cell
                  key={entry.month}
                  fill={expenseColor}
                  opacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
