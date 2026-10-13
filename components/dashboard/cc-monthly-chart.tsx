'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'

interface Props {
  data: Record<number, number>
  /** Number of months (from January) to plot */
  monthCount?: number
  selectedMonth?: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-[hsl(var(--cc))] font-medium tabular-nums">
        {payload[0].value == null ? 'אין נתונים' : formatCurrency(payload[0].value)}
      </p>
    </div>
  )
}

function CCMonthlyChartInner({ data, monthCount = 12, selectedMonth }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const strokeColor = isDark ? 'var(--chart-cc, #d4955a)' : 'var(--chart-cc, #b8732a)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const axes = useChartAxes(textColor)
  const gridColor = isDark ? '#283040' : '#e2e8ed'

  // Months without an uploaded statement are gaps, not ₪0
  const chartData = Array.from({ length: monthCount }, (_, i) => ({
    month: i + 1,
    name: monthName(i + 1),
    'חיובי מקס': data[i + 1] ? data[i + 1] : null,
  }))

  function handleClick(entry: { month: number }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('month', String(entry.month))
    router.push(`/cards?${sp.toString()}`)
  }

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <h3 className="font-semibold text-base">מגמת חיובי כרטיס אשראי</h3>
      <p className="text-sm text-muted-foreground mb-5">לחיצה על חודש פותחת את פירוט החיובים שלו</p>
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
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
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="חיובי מקס"
              stroke={strokeColor}
              strokeWidth={2.5}
              dot={(props: any) => {
                if (props.cy == null) return <g key={props.payload.month} />
                const selected = props.payload.month === selectedMonth
                return (
                  <circle
                    key={props.payload.month}
                    cx={props.cx}
                    cy={props.cy}
                    r={selected ? 6 : 3.5}
                    fill={strokeColor}
                    stroke={selected ? 'hsl(var(--card))' : 'none'}
                    strokeWidth={selected ? 2 : 0}
                  />
                )
              }}
              activeDot={{ r: 5.5, fill: strokeColor, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function CCMonthlyChart(props: Props) {
  return (
    <Suspense fallback={<div className="rounded-xl border bg-card p-5 h-48 sm:h-64 animate-pulse" />}>
      <CCMonthlyChartInner {...props} />
    </Suspense>
  )
}
