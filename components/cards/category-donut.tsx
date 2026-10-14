'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Props as LegendProps } from 'recharts/types/component/DefaultLegendContent'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { CategoryAnalysisLink } from '@/components/cards/category-analysis-link'
import { formatCurrency } from '@/lib/utils/currency'
import { RollingNumber } from '@/components/ui/rolling-number'
import { accountPath } from '@/lib/accounts/routes'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'

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
  accountId,
  data,
  stats,
  selectedCategory,
  colors,
  analysisHref,
}: {
  accountId: string
  data: Record<string, number>
  stats?: Record<string, { total: number; count: number }>
  selectedCategory?: string
  colors?: Record<string, string>
  analysisHref?: string
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
    router.push(`${accountPath('CREDIT_CARD', accountId)}?${sp.toString()}`, { scroll: false })
  }

  return (
    <section className={SECTION}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <ChartHeader title="הוצאות לפי קטגוריה" subtitle="לחיצה על קטגוריה מסננת" className="mb-0" />
        {analysisHref && <CategoryAnalysisLink href={analysisHref} />}
      </div>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">אין חיובים לתקופה זו</p>
      ) : (
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

        {/* Legend as a table: category | count | amount, on one grid so the columns line up */}
        <div className="flex w-full min-w-0 flex-1 flex-col gap-0.5">
          {chartData.map((entry, i) => {
            const count = stats?.[entry.name]?.count
            return (
              <button
                key={entry.name}
                onClick={() => handleClick(entry)}
                className="grid w-full grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-x-2 rounded-md px-1.5 py-1 text-start text-sm transition-colors hover:bg-muted"
                style={{ opacity: selectedCategory && selectedCategory !== entry.name ? 0.4 : 1 }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorOf(entry.name, i) }}
                    aria-hidden
                  />
                  <span className="truncate text-foreground">{entry.name}</span>
                </span>
                <span className="whitespace-nowrap text-center text-xs tabular-nums text-muted-foreground">
                  {count !== undefined && (
                    <>
                      <RollingNumber value={count} format="integer" /> {count === 1 ? 'עסקה' : 'עסקאות'}
                    </>
                  )}
                </span>
                <RollingNumber
                  value={entry.value}
                  format="currencyExact"
                  className="whitespace-nowrap text-end text-xs font-medium tabular-nums text-[hsl(var(--expense))]"
                />
              </button>
            )
          })}
        </div>
      </div>
      )}
    </section>
  )
}

export function CategoryDonut({
  accountId,
  data,
  stats,
  selectedCategory,
  colors,
  analysisHref,
}: {
  accountId: string
  data: Record<string, number>
  stats?: Record<string, { total: number; count: number }>
  selectedCategory?: string
  colors?: Record<string, string>
  /** Link-button to the category analysis page */
  analysisHref?: string
}) {
  return (
    <Suspense fallback={<div className={`${SECTION} h-64`} />}>
      <CategoryDonutInner
        accountId={accountId}
        data={data}
        stats={stats}
        selectedCategory={selectedCategory}
        colors={colors}
        analysisHref={analysisHref}
      />
    </Suspense>
  )
}
