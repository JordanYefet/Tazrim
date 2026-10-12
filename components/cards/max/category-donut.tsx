'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Props as LegendProps } from 'recharts/types/component/DefaultLegendContent'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { RollingNumber } from '@/components/ui/rolling-number'

// CSS vars (defined per theme in globals.css) so SSR and client markup match
const COLORS = Array.from({ length: 10 }, (_, i) => `var(--chart-${i + 1})`)

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-0.5">{payload[0].name}</p>
      <p className="text-[hsl(var(--expense))] font-medium">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

function CategoryDonutInner({
  data,
  stats,
  selectedCategory,
  colors,
}: {
  data: Record<string, number>
  stats?: Record<string, { total: number; count: number }>
  selectedCategory?: string
  colors?: Record<string, string>
}) {
  const router = useRouter()
  const params = useSearchParams()

  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  // Stable per-category colors when provided, so they match the trend chart
  const colorOf = (name: string, i: number) => colors?.[name] ?? COLORS[i % COLORS.length]

  function handleClick(entry: { name: string }) {
    const sp = new URLSearchParams(params.toString())
    if (selectedCategory === entry.name) {
      sp.delete('category')
    } else {
      sp.set('category', entry.name)
    }
    router.push(`/cards/max?${sp.toString()}`)
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold text-base mb-0.5">הוצאות לפי קטגוריה</h3>
      <p className="text-xs text-muted-foreground mb-4">לחץ על קטגוריה לסינון</p>
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="h-52 w-52 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius="42%"
                outerRadius="78%"
                paddingAngle={2}
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={colorOf(entry.name, i)}
                    opacity={selectedCategory && selectedCategory !== entry.name ? 0.25 : 1}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend as table */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {chartData.map((entry, i) => (
            <button
              key={entry.name}
              onClick={() => handleClick(entry)}
              className="flex items-center gap-2 text-sm text-start w-full rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
              style={{ opacity: selectedCategory && selectedCategory !== entry.name ? 0.4 : 1 }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: colorOf(entry.name, i) }}
              />
              <span className="flex-1 truncate text-foreground">{entry.name}</span>
              {stats?.[entry.name] && (
                <RollingNumber value={stats[entry.name].count} format="integer" className="text-muted-foreground text-xs" />
              )}
              <RollingNumber value={entry.value} format="currencyExact" className="text-[hsl(var(--expense))] text-xs font-medium" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CategoryDonut({
  data,
  stats,
  selectedCategory,
  colors,
}: {
  data: Record<string, number>
  stats?: Record<string, { total: number; count: number }>
  selectedCategory?: string
  colors?: Record<string, string>
}) {
  return (
    <Suspense fallback={<div className="rounded-lg border bg-card p-5 h-64" />}>
      <CategoryDonutInner data={data} stats={stats} selectedCategory={selectedCategory} colors={colors} />
    </Suspense>
  )
}
