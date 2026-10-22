import { PieChart, Upload } from 'lucide-react'
import { CategoryTrendChart } from '@/components/cards/category-trend-chart'
import { CategoryMonthTable } from '@/components/cards/category-month-table'
import { EmptyState } from '@/components/accounts/page-parts'
import { categoryTransactionsHref } from '@/lib/accounts/category-links'
import { latestMonthWithData, rankCategories, type CategoryMonthly } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'

/**
 * The stacked category chart and the category × month table, for one card or
 * several. Month clicks stay on `basePath`; category links open the card's
 * transactions filtered to that category (a search when there are several cards).
 */
export function CategoryAnalysis({
  cardIds,
  monthly,
  year,
  month,
  basePath,
  emptyText,
}: {
  cardIds: string[]
  monthly: CategoryMonthly
  year: string
  month?: number
  basePath: string
  emptyText: string
}) {
  const lastMonth = latestMonthWithData(monthly)
  if (!lastMonth) {
    return (
      <EmptyState
        icon={PieChart}
        title={`אין חיובים לשנת ${year}`}
        text={emptyText}
        actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
      />
    )
  }

  // Same colors as the card pages: ranked by yearly spend
  const ranked = rankCategories(monthly)
  const colors = categoryColorMap(ranked)
  const categoryHrefs = Object.fromEntries(
    ranked.map(c => [c, categoryTransactionsHref({ cardIds, category: c, year, month })])
  )

  return (
    <>
      <CategoryTrendChart
        basePath={basePath}
        categoryHrefs={categoryHrefs}
        monthly={monthly}
        ranked={ranked}
        colors={colors}
        selectedMonth={month}
      />
      <CategoryMonthTable
        basePath={basePath}
        categoryHrefs={categoryHrefs}
        monthly={monthly}
        ranked={ranked}
        colors={colors}
        lastMonth={lastMonth}
        year={year}
        selectedMonth={month}
      />
    </>
  )
}
