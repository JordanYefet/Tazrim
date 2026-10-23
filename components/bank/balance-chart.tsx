'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { ChartHeader, SECTION, type LegendItem } from '@/components/accounts/page-parts'
import { balanceSeries, type BalanceRow } from '@/lib/insights/balance-series'

const INCOME = 'הכנסות'
const EXPENSE = 'הוצאות'
const BALANCE = 'יתרה'

const COLORS = {
  [INCOME]: 'var(--chart-income)',
  [EXPENSE]: 'var(--chart-expense)',
  [BALANCE]: 'var(--chart-1)',
} as const

function CustomTooltip({ active, payload, label, shown }: any) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p: any) => shown.includes(p.dataKey))
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {rows.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: p.stroke }} />
          <span className="text-muted-foreground">{p.dataKey === BALANCE ? 'יתרה' : `${p.dataKey} מתחילת התקופה`}:</span>
          <span className="ms-auto ps-3 font-semibold tabular-nums text-foreground">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * The account's balance (dashed) with the running income and expense totals
 * of the period: where the two lines part is how the balance moved. The
 * income / expenses switch hides the other line; the balance always shows.
 * A hidden line is not unmounted: it sinks to zero and fades, so switching animates.
 */
export function BalanceChart({ data, flow }: { data: BalanceRow[]; flow?: 'IN' | 'OUT' }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  const showIncome = flow !== 'OUT'
  const showExpense = flow !== 'IN'
  const chartData = balanceSeries(data).map(p => ({
    date: formatDate(p.date),
    [INCOME]: showIncome ? p.income : 0,
    [EXPENSE]: showExpense ? p.expense : 0,
    [BALANCE]: p.balance,
  }))

  const shown = [...(showIncome ? [INCOME] : []), ...(showExpense ? [EXPENSE] : []), BALANCE]
  const legend: LegendItem[] = shown.map(k => ({ label: k, color: COLORS[k as keyof typeof COLORS], dashed: k === BALANCE }))

  const line = (key: keyof typeof COLORS, visible: boolean, dashed = false) => (
    <Line {...anim}
      type="monotone"
      dataKey={key}
      stroke={COLORS[key]}
      strokeDasharray={dashed ? '6 5' : undefined}
      strokeOpacity={visible ? 1 : 0}
      className="chart-series-fade"
      dot={false}
      activeDot={visible ? undefined : false}
      strokeWidth={dashed ? 2 : 2.5}
    />
  )

  return (
    <section className={SECTION}>
      <ChartHeader title="יתרת חשבון לאורך זמן" subtitle="כל התנועות בתקופה" legend={legend} />
      <div className="h-48 sm:h-64 md:h-72">
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
              <Tooltip content={<CustomTooltip shown={shown} />} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />
              {line(INCOME, showIncome)}
              {line(EXPENSE, showExpense)}
              {line(BALANCE, true, true)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
