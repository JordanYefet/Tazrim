import { MaxSummaryCards } from '@/components/cards/max/max-summary-cards'
import { CategoryDonut } from '@/components/cards/max/category-donut'
import { MonthlySpendingChart } from '@/components/cards/max/monthly-spending-chart'
import { MaxTransactionsTable } from '@/components/cards/max/max-transactions-table'
import { CategoryTrendChart } from '@/components/cards/max/category-trend-chart'
import { CategoryMonthTable } from '@/components/cards/max/category-month-table'
import { getCCCategoryMonthly, getCCCategoryStats, getCCTransactions, getMaxCardIds } from '@/lib/db/cards'
import { getCategories } from '@/lib/db/categories'
import { asJson, getYearSummary } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { latestMonthWithData, rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'

interface SearchParams {
  year?: string
  month?: string
  search?: string
  merchant?: string
  category?: string
  showIgnored?: string
}

async function getMaxData(params: SearchParams) {
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined

  // Every MAX card. Same query as /api/cards/max/transactions (first page of 50 unless a month is selected)
  const accountId = await getMaxCardIds()
  const [txs, yearSummary, categoryRows, unusual] = await Promise.all([
    getCCTransactions({
      accountId,
      year: Number(year),
      month,
      search: params.search,
      merchant: params.merchant,
      category: params.category,
      showIgnored: params.showIgnored === 'true',
      take: month ? undefined : 50,
    }),
    getYearSummary(Number(year)),
    getCategories(),
    // Flags for the whole year (every account's history as baseline), so "load more" rows get badges too
    // recurring charges are exempt from the outlier checks (ENG-37)
    getRecurringSeries().then(r =>
      getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } })
    ),
  ])

  const transactions = asJson(txs)
  const summary = asJson(yearSummary)
  const categories = asJson(categoryRows)

  const [stats, categoryMonthly] = await Promise.all([
    getCCCategoryStats(accountId, Number(year), month),
    getCCCategoryMonthly(accountId, Number(year)),
  ])
  const categoryTotals: Record<string, number> = Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k, v.total])
  )

  return { transactions, maxSummary: summary.max, categoryTotals, categoryStats: stats, categories, categoryMonthly, unusual: unusual.card }
}

export default async function MaxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const { transactions, maxSummary, categoryTotals, categoryStats, categories, categoryMonthly, unusual } = await getMaxData(params)
  const month = params.month ? Number(params.month) : undefined

  const total = params.category
    ? (categoryStats[params.category]?.total ?? 0)
    : Object.values(categoryStats).reduce((s, v) => s + v.total, 0)
  const count = params.category
    ? (categoryStats[params.category]?.count ?? 0)
    : Object.values(categoryStats).reduce((s, v) => s + v.count, 0)

  const averageMonthly = !params.month && !params.category
    ? total / Math.max((Object.values(maxSummary as Record<string, number>)).filter(v => v > 0).length, 1)
    : undefined

  // Same category colors on every chart, ranked by yearly spend
  const rankedCategories = rankCategories(categoryMonthly)
  const categoryColors = categoryColorMap(rankedCategories)
  const now = new Date()
  const trendMonths =
    Number(year) < now.getFullYear()
      ? 12
      : Math.max(Number(year) === now.getFullYear() ? now.getMonth() + 1 : 1, latestMonthWithData(categoryMonthly) ?? 1)

  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.category) fetchSp.set('category', params.category)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !params.month && transactions.length >= 50

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">מקס כרטיס אשראי</h1>
      <MaxSummaryCards total={total} count={count} average={averageMonthly} />

      {/* Monthly bar chart + category donut side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlySpendingChart data={maxSummary} selectedMonth={month} />
        <CategoryDonut
          data={categoryTotals}
          stats={categoryStats}
          selectedCategory={params.category}
          colors={categoryColors}
        />
      </div>

      <CategoryTrendChart
        monthly={categoryMonthly}
        ranked={rankedCategories}
        colors={categoryColors}
        monthCount={trendMonths}
        selectedMonth={month}
        selectedCategory={params.category}
      />

      {latestMonthWithData(categoryMonthly) && (
        <CategoryMonthTable
          monthly={categoryMonthly}
          ranked={rankedCategories}
          colors={categoryColors}
          lastMonth={latestMonthWithData(categoryMonthly)!}
          year={year}
          selectedMonth={month}
          selectedCategory={params.category}
        />
      )}

      <MaxTransactionsTable
        key={[params.merchant, params.month, params.year, params.category, params.showIgnored].join('|')}
        transactions={transactions}
        categories={categories}
        activeCategory={params.category}
        showIgnored={params.showIgnored === 'true'}
        hasMore={hasMore}
        fetchParams={hasMore ? fetchSp.toString() : undefined}
        unusual={unusual}
      />
    </div>
  )
}
