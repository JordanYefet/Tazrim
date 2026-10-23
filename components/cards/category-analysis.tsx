import { PieChart, Upload } from 'lucide-react'
import { CategoryTrendChart } from '@/components/cards/category-trend-chart'
import { CategoryMonthTable } from '@/components/cards/category-month-table'
import { EmptyState } from '@/components/accounts/page-parts'
import { latestMonthWithData, rankCategories, type CategoryMonthly } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'

/**
 * The stacked category chart and the category × month table, for cards or
 * bank rows. Month clicks stay on `basePath`; category links go where
 * `categoryHref` says (lib/accounts/category-links), none for a bucket that
 * has no transactions page.
 */
export function CategoryAnalysis({
  monthly,
  year,
  month,
  basePath,
  categoryHref,
  emptyText,
  emptyTitle = `אין חיובים לשנת ${year}`,
  chartTitle,
  unit,
}: {
  monthly: CategoryMonthly
  year: string
  month?: number
  basePath: string
  categoryHref: (category: string) => string | undefined
  emptyText: string
  emptyTitle?: string
  chartTitle?: string
  /** What a month "with data" holds (default: charges) */
  unit?: string
}) {
  const lastMonth = latestMonthWithData(monthly)
  if (!lastMonth) {
    return (
      <EmptyState
        icon={PieChart}
        title={emptyTitle}
        text={emptyText}
        actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
      />
    )
  }

  // Same colors as the card pages: ranked by yearly spend
  const ranked = rankCategories(monthly)
  const colors = categoryColorMap(ranked)
  const categoryHrefs = Object.fromEntries(
    ranked.map(c => [c, categoryHref(c)])
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
        title={chartTitle}
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
        unit={unit}
      />
    </>
  )
}
