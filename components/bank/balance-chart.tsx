'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'

interface TxPoint { date: string; balance: number }

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      <p className="text-[hsl(var(--income))] font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export function BalanceChart({ data }: { data: TxPoint[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const strokeColor = isDark ? 'var(--chart-income, #3aad76)' : 'var(--chart-income, #2e8a5e)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const axes = useChartAxes(textColor)

  const chartData = [...data].reverse().map(d => ({
    date: formatDate(d.date),
    יתרה: d.balance,
  }))

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <h3 className="font-semibold text-base mb-0.5">יתרת חשבון לאורך זמן</h3>
      <p className="text-xs text-muted-foreground mb-4"> </p>
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={axes.margin}>
            <XAxis
              dataKey="date"
              {...axes.xAxis}
              tickFormatter={(d: string) => (axes.small ? d.slice(0, 5) : d)}
              interval="preserveStartEnd"
              minTickGap={axes.small ? 16 : 24}
            />
            <YAxis {...axes.yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="יתרה"
              stroke={strokeColor}
              dot={false}
              strokeWidth={2.5}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
