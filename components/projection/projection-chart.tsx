'use client'

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { formatCurrency } from '@/lib/utils/currency'
import { buildChartRows, type ChartRow } from '@/lib/insights/projection-rows'
import type { ProjectedMonth } from '@/lib/insights/projection'

type Row = ChartRow

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row: Row = payload[0].payload
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
      {row.actual !== undefined && <p className="font-semibold tabular-nums">{formatCurrency(row.actual)}</p>}
      {row.expected !== undefined && row.band && (
        <>
          <p className="font-semibold tabular-nums">{formatCurrency(row.expected)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(row.band[0])} – {formatCurrency(row.band[1])}</p>
        </>
      )}
    </div>
  )
}

/** Actual month-end balance, then the forecast as a dashed line in its band. Just the chart: the hero card holds it. */
export function ProjectionChart({ past, months, start, cushion }: {
  past: { month: string; balance: number }[]
  months: ProjectedMonth[]
  start: number
  cushion: number
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  // The same axis colours as the other charts (docs/design-system.md, Known gaps)
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  const anim = useChartAnimation()

  const data = buildChartRows(past, months, start)

  return (
    <div dir="ltr" className="h-64 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={axes.margin}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
          <XAxis dataKey="label" {...axes.xAxis} interval="preserveStartEnd" />
          <YAxis {...axes.yAxis} />
          <Tooltip content={<ChartTooltip />} />
          <Area dataKey="staleBand" stroke="none" fill="var(--chart-1)" fillOpacity={0.06} isAnimationActive={false} />
          <Area {...anim} dataKey="band" stroke="none" fill="var(--chart-1)" fillOpacity={0.14} isAnimationActive={false} />
          <ReferenceLine y={cushion} stroke={textColor} strokeOpacity={0.5} strokeDasharray="2 4" />
          <Line {...anim} dataKey="actual" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} connectNulls={false} />
          <Line {...anim} dataKey="staleExpected" stroke="var(--chart-1)" strokeOpacity={0.35} strokeWidth={2} strokeDasharray="6 5" dot={false} />
          <Line {...anim} dataKey="expected" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 5" dot={false} />
          {data.filter(r => r.tight).map(r => (
            <ReferenceDot key={r.label} x={r.label} y={r.expected ?? r.staleExpected} r={4} fill="var(--chart-expense)" stroke="none" />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
