'use client'

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { formatCurrency } from '@/lib/utils/currency'
import { buildChartRows, chartDomain, type ChartRow } from '@/lib/insights/projection-rows'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { useSelectedMonth } from './selected-month'
import { useEntranceOnce } from './use-entrance-once'

type Row = ChartRow

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row: Row = payload[0].payload
  // A stale month carries its value in the faint series; a join row already shows its actual
  const expected = row.actual === undefined ? row.expected ?? row.staleExpected : undefined
  const band = row.band ?? row.staleBand
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
      {row.actual !== undefined && <p className="font-semibold tabular-nums">{formatCurrency(row.actual)}</p>}
      {expected !== undefined && band && (
        <>
          <p className="font-semibold tabular-nums">{formatCurrency(expected)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(band[0])} – {formatCurrency(band[1])}</p>
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
  const anim = useEntranceOnce()

  // Kept between renders: picking a month must not replay the lines' entrance
  const data = useMemo(() => buildChartRows(past, months, start), [past, months, start])
  const y = useMemo(() => chartDomain(data, cushion), [data, cushion])
  // A forecast month picked on the chart drives the hero and the category lines; the same month again clears it
  const { month: selected, select } = useSelectedMonth()
  const selectedLabel = data.find(r => r.month && r.month === selected)?.label
  const pick = (state: { activeLabel?: string | number } | null) => {
    const row = data.find(r => r.label === state?.activeLabel)
    if (row?.month) select(row.month === selected ? null : row.month)
  }

  return (
    <div dir="ltr" className="h-64 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={axes.margin} onClick={pick} style={{ cursor: 'pointer' }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
          <XAxis dataKey="label" {...axes.xAxis} interval="preserveStartEnd" />
          <YAxis {...axes.yAxis} domain={y.domain} ticks={y.ticks} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="staleBand" stroke="none" fill="var(--chart-1)" fillOpacity={0.06} isAnimationActive={false} />
          <Area {...anim} type="monotone" dataKey="band" stroke="none" fill="var(--chart-1)" fillOpacity={0.14} isAnimationActive={false} />
          {selectedLabel && <ReferenceLine x={selectedLabel} stroke="var(--chart-1)" strokeOpacity={0.15} strokeWidth={16} />}
          <ReferenceLine y={cushion} stroke={textColor} strokeOpacity={0.5} strokeDasharray="2 4" />
          <Line {...anim} type="monotone" dataKey="actual" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} connectNulls={false} />
          <Line {...anim} type="monotone" dataKey="staleExpected" stroke="var(--chart-1)" strokeOpacity={0.35} strokeWidth={2} strokeDasharray="6 5" dot={false} />
          <Line {...anim} type="monotone" dataKey="expected" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 5" dot={false} />
          {data.filter(r => r.tight).map(r => (
            <ReferenceDot key={r.label} x={r.label} y={r.expected ?? r.staleExpected} r={4} fill="var(--chart-expense)" stroke="none" />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
