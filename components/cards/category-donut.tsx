'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import type { Props as LegendProps } from 'recharts/types/component/DefaultLegendContent'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { RollingNumber } from '@/components/ui/rolling-number'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'
import { CategoryAnalysisLink } from '@/components/cards/category-analysis-link'

// CSS vars (defined per theme in globals.css) so SSR and client markup match
const COLORS = Array.from({ length: 10 }, (_, i) => `var(--chart-${i + 1})`)

type Tone = 'expense' | 'income'
const TONE_TEXT: Record<Tone, string> = {
  expense: 'text-[hsl(var(--expense))]',
  income: 'text-[hsl(var(--income))]',
}

function CustomTooltip({ active, payload, tone = 'expense' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-0.5">{payload[0].name}</p>
      <p className={`${TONE_TEXT[tone as Tone]} font-medium`}>{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

function CategoryDonutInner({
  pagePath,
  data,
  stats,
  selectedCategory,
  colors,
  title = 'הוצאות לפי קטגוריה',
  tone = 'expense',
  emptyText = 'אין חיובים לתקופה זו',
  analysisHref,
  categoryHrefs,
}: Props) {
  const router = useRouter()
  const params = useSearchParams()
  // Entrance on the shared page beat (ENG-67)
  const anim = useChartAnimation()

  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  // Stable per-category colors when provided, so they match the trend chart
  const colorOf = (name: string, i: number) => colors?.[name] ?? COLORS[i % COLORS.length]

  function handleClick(entry: { name: string }) {
    // A page without a table of its own (/cards) opens the category's transactions instead
    const href = categoryHrefs?.[entry.name]
    if (categoryHrefs) {
      if (href) router.push(href)
      return
    }
    const sp = new URLSearchParams(params.toString())
    if (selectedCategory === entry.name) {
      sp.delete('category')
    } else {
      sp.set('category', entry.name)
    }
    router.push(`${pagePath}?${sp.toString()}`, { scroll: false })
  }

  return (
    <section className={SECTION}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <ChartHeader
          title={title}
          subtitle={categoryHrefs ? 'לחיצה על קטגוריה פותחת את העסקאות שלה' : 'לחיצה על קטגוריה מסננת'}
          className="mb-0"
        />
        {analysisHref && <CategoryAnalysisLink href={analysisHref} />}
      </div>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="h-52 w-52 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie {...anim}
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius="42%"
                outerRadius="78%"
                // A ring of one slice (one category, e.g. under a merchant filter) has no
                // gap and no outline: either draws a seam where the ring meets itself
                paddingAngle={chartData.length > 1 ? 2 : 0}
                stroke={chartData.length > 1 ? undefined : 'none'}
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
              <Tooltip content={<CustomTooltip tone={tone} />} />
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
                className="grid w-full grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] rounded-md px-1.5 py-1 text-start text-sm transition-colors hover:bg-muted"
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
                <span
                  className="whitespace-nowrap text-center text-xs tabular-nums text-muted-foreground"
                  title={count !== undefined ? 'מספר עסקאות' : undefined}
                >
                  {count !== undefined && <RollingNumber value={count} format="integer" />}
                </span>
                <RollingNumber
                  value={entry.value}
                  format="currencyExact"
                  className={`whitespace-nowrap text-end text-xs font-medium tabular-nums ${TONE_TEXT[tone]}`}
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

interface Props {
  /** The page the donut sits on: a category click filters it with `?category=` */
  pagePath: string
  data: Record<string, number>
  stats?: Record<string, { total: number; count: number }>
  selectedCategory?: string
  colors?: Record<string, string>
  title?: string
  emptyText?: string
  /** Link-button to the category analysis page, in the card's header */
  analysisHref?: string
  /**
   * Where each category opens (a page with no table to filter, e.g. /cards).
   * Without it a click filters this page with `?category=`.
   */
  categoryHrefs?: Record<string, string>
  /** Amount colour: spending (cards, bank debits) or income (bank credits) */
  tone?: Tone
}

export function CategoryDonut(props: Props) {
  return (
    <Suspense fallback={<div className={`${SECTION} h-64`} />}>
      <CategoryDonutInner {...props} />
    </Suspense>
  )
}
