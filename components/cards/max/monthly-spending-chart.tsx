'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'

interface Props {
  data: Record<string, number>
  selectedMonth?: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-[hsl(var(--expense))] font-medium">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export function MonthlySpendingChart({ data, selectedMonth }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const barColor = isDark ? 'var(--chart-expense, #e05c52)' : 'var(--chart-expense, #d94040)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const axes = useChartAxes(textColor)

  const chartData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    return {
      month: m,
      name: monthName(m),
      'הוצאות': data[String(m)] ?? 0,
    }
  })

  function handleClick(entry: { month: number }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('month', String(entry.month))
    router.push(`/cards/max?${sp.toString()}`)
  }

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <h3 className="font-semibold text-base mb-0.5">הוצאות חודשיות</h3>
      <p className="text-xs text-muted-foreground mb-4">לחץ על חודש לסינון</p>
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={axes.margin}
            onClick={e => e?.activePayload && handleClick(e.activePayload[0].payload)}
          >
            <XAxis
              dataKey="name"
              {...axes.xAxis}
              tickFormatter={axes.monthTick}
              interval={axes.monthInterval(chartData.length)}
            />
            <YAxis {...axes.yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="הוצאות" radius={[3, 3, 0, 0]} maxBarSize={28} cursor="pointer">
              {chartData.map(entry => (
                <Cell
                  key={entry.month}
                  fill={barColor}
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
