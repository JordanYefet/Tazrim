'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'
import { CategoryAnalysisLink } from '@/components/cards/category-analysis-link'

interface TxPoint { date: string; balance: number }

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      <p className="font-semibold tabular-nums text-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export function BalanceChart({
  data,
  analysisHref,
  subtitle = 'כל התנועות בתקופה',
}: {
  data: TxPoint[]
  /** Link-button to the category analysis page, in the card's header (the bank pages) */
  analysisHref?: string
  subtitle?: string
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  // Light blue, like the balance sparkline on the account element
  const strokeColor = 'var(--chart-1)'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  const chartData = [...data].reverse().map(d => ({
    date: formatDate(d.date),
    יתרה: d.balance,
  }))

  return (
    <section className={`${SECTION} flex flex-col`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <ChartHeader title="יתרת חשבון לאורך זמן" subtitle={subtitle} className="mb-0" />
        {analysisHref && <CategoryAnalysisLink href={analysisHref} />}
      </div>
      {/* Fills the card: as tall as a taller neighbour in its row (a long category legend), never shorter than this */}
      <div className="min-h-48 flex-1 sm:min-h-64 md:min-h-72">
        {chartData.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">אין תנועות לתקופה זו</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={axes.margin}>
              <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
              <XAxis
                dataKey="date"
                {...axes.xAxis}
                tickFormatter={(d: string) => (axes.small ? d.slice(0, 5) : d)}
                interval="preserveStartEnd"
                minTickGap={axes.small ? 16 : 24}
              />
              <YAxis {...axes.yAxis} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />
              <Line {...anim}
                type="monotone"
                dataKey="יתרה"
                stroke={strokeColor}
                dot={false}
                strokeWidth={2.5}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
