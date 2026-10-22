'use client'

/*
 * Shared pieces for the monthly bar charts (ENG-70): every chart plots January
 * to December, and a month without data is an empty slot. These draw that
 * slot, read which month a click landed on, and word its tooltip.
 */

interface SlotRow {
  month: number
  name: string
  empty: boolean
}

/**
 * Faint placeholder tracks behind the empty months, a little stronger on the
 * selected month so it is highlighted even without a bar. Render it through
 * Recharts' <Customized component={<EmptyMonthSlots ... />} /> before the bars;
 * Recharts adds the chart's layout props (xAxisMap, offset, data).
 */
export function EmptyMonthSlots({
  selectedMonth,
  maxWidth = 28,
  ...chart
}: {
  selectedMonth?: number
  /** The widest a track gets (about the bar group's width) */
  maxWidth?: number
  // Injected by Recharts
  [key: string]: unknown
}) {
  const xAxis = Object.values((chart.xAxisMap ?? {}) as Record<string, { scale?: any }>)[0]
  const offset = chart.offset as { top: number; height: number } | undefined
  const data = (chart.data ?? []) as SlotRow[]
  const scale = xAxis?.scale
  const band: number | undefined = scale?.bandwidth?.()
  if (!scale || !band || !offset) return null

  const width = Math.min(band * 0.6, maxWidth)
  return (
    <g className="month-slots" aria-hidden>
      {data
        .filter(row => row.empty)
        .map(row => {
          const x = scale(row.name)
          if (x == null || Number.isNaN(x)) return null
          const selected = row.month === selectedMonth
          return (
            <rect
              key={row.month}
              x={x + (band - width) / 2}
              y={offset.top}
              width={width}
              height={offset.height}
              rx={3}
              className={selected ? 'month-slot month-slot-selected' : 'month-slot'}
            />
          )
        })}
    </g>
  )
}

/**
 * The month (1-12) a click on a full-year chart landed on. Works on empty
 * months too, where there is no bar: the rows are January to December, so
 * the hovered index is the month.
 */
export function clickedMonth(e: { activeTooltipIndex?: number; activePayload?: { payload?: { month?: number } }[] } | null | undefined): number | undefined {
  const fromPayload = e?.activePayload?.[0]?.payload?.month
  if (fromPayload) return fromPayload
  const i = e?.activeTooltipIndex
  return i != null && i >= 0 && i < 12 ? i + 1 : undefined
}

/** Tooltip body for a month without data yet. */
export function EmptyMonthTooltip({ label }: { label?: string }) {
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-muted-foreground">אין נתונים עדיין</p>
    </div>
  )
}

/** True when the tooltip is over an empty month (pass the Tooltip filterNull={false}). */
export function isEmptyMonthPayload(payload: { payload?: { empty?: boolean } }[] | undefined): boolean {
  return !!payload?.[0]?.payload?.empty
}
