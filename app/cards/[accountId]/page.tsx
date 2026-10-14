import { notFound } from 'next/navigation'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { CardSummaryCards } from '@/components/cards/card-summary-cards'
import { CategoryDonut } from '@/components/cards/category-donut'
import { MonthlySpendingChart } from '@/components/cards/monthly-spending-chart'
import { CardTransactionsTable } from '@/components/cards/card-transactions-table'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { getCCCategoryMonthly, getCCCategoryStats, getCCMonthlySummary, getCCTransactions } from '@/lib/db/cards'
import { getAccount } from '@/lib/db/accounts'
import { getCategories } from '@/lib/db/categories'
import { asJson } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { rankCategories } from '@/lib/insights/category-insights'
import { lastMonthWithData, monthlyAverage, plottedMonthCount } from '@/lib/insights/account-overview'
import { accountHref } from '@/lib/accounts/routes'
import { categoryAnalysisHref } from '@/lib/accounts/category-links'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { monthName, periodLabel } from '@/lib/utils/date'

interface SearchParams {
  year?: string
  month?: string
  search?: string
  merchant?: string
  category?: string
  showIgnored?: string
}

async function getCardData(accountId: string, params: SearchParams) {
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined

  // Same query as /api/cards/[accountId]/transactions (first page of 50 unless a month is selected)
  const [txs, monthly, categoryRows, unusual, stats, categoryMonthly] = await Promise.all([
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
    getCCMonthlySummary(accountId, Number(year)),
    getCategories(),
    // Flags for the whole year (every account's history as baseline), so "load more" rows get badges too
    // recurring charges are exempt from the outlier checks (ENG-37)
    getRecurringSeries().then(r =>
      getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } })
    ),
    getCCCategoryStats(accountId, Number(year), month),
    getCCCategoryMonthly(accountId, Number(year)),
  ])

  const categoryTotals: Record<string, number> = Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k, v.total])
  )

  return {
    transactions: asJson(txs),
    monthly,
    categoryTotals,
    categoryStats: stats,
    categories: asJson(categoryRows),
    categoryMonthly,
    unusual: unusual.card,
  }
}

export default async function CardAccountPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { accountId } = await routeParams
  const account = await getAccount(decodeURIComponent(accountId))
  if (!account || account.kind !== 'CREDIT_CARD') notFound()

  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined
  const { transactions, monthly, categoryTotals, categoryStats, categories, categoryMonthly, unusual } =
    await getCardData(account.id, params)

  const total = params.category
    ? (categoryStats[params.category]?.total ?? 0)
    : Object.values(categoryStats).reduce((s, v) => s + v.total, 0)
  const count = params.category
    ? (categoryStats[params.category]?.count ?? 0)
    : Object.values(categoryStats).reduce((s, v) => s + v.count, 0)

  // Yearly average over months with charges (same months the chart shows); with a
  // category filter, that category's yearly total over the same months (as the
  // category page's table averages it). Always shown, so a month can be compared.
  const averageMonthly = monthlyAverage(
    params.category ? (categoryMonthly[params.category] ?? {}) : monthly,
    monthly
  )

  // Same category colors on every chart, ranked by yearly spend
  const categoryColors = categoryColorMap(rankCategories(categoryMonthly))
  const monthCount = plottedMonthCount(Number(year), lastMonthWithData(monthly))

  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.category) fetchSp.set('category', params.category)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !params.month && transactions.length >= 50

  const hasData = lastMonthWithData(monthly) > 0 || transactions.length > 0
  const period = { year, ...(month ? { month: String(month) } : {}) }
  const title = account.cardLastFour ? `${account.displayName} ·${account.cardLastFour}` : account.displayName

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={periodLabel(year, month)}
        title={title}
        back={{ href: accountHref('CREDIT_CARD', undefined, period), label: 'כרטיסי אשראי' }}
        badge={account.archived ? 'בארכיון' : undefined}
      />

      {hasData ? (
        <>
          <CardSummaryCards
            total={total}
            count={count}
            average={averageMonthly}
            monthLabel={month ? monthName(month) : undefined}
            label={params.category ? `חיובים · ${params.category}` : undefined}
          />

          {/* Monthly bar chart + category donut side by side on large screens */}
          {/* Same 5/7 split as the summary row above, so the edges line up */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <MonthlySpendingChart
              accountId={account.id}
              series={[{ key: account.id, label: account.displayName, color: 'var(--chart-cc)', data: monthly }]}
              selectedMonth={month}
              monthCount={monthCount}
            />
            <CategoryDonut
              accountId={account.id}
              data={categoryTotals}
              stats={categoryStats}
              selectedCategory={params.category}
              colors={categoryColors}
              analysisHref={categoryAnalysisHref(account.id, period)}
            />
          </div>
        </>
      ) : (
        <EmptyState
          icon={FileSpreadsheet}
          title={`אין חיובים לשנת ${year}`}
          text={`העלה פירוט חיובים של ${account.displayName} כדי לראות כאן את החיובים לפי חודש וקטגוריה.`}
          actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
        />
      )}

      {(hasData || params.showIgnored === 'true' || params.merchant || params.search) && (
        <CardTransactionsTable
          key={[params.merchant, params.month, params.year, params.category, params.showIgnored].join('|')}
          accountId={account.id}
          transactions={transactions}
          categories={categories}
          activeCategory={params.category}
          showIgnored={params.showIgnored === 'true'}
          hasMore={hasMore}
          fetchParams={hasMore ? fetchSp.toString() : undefined}
          unusual={unusual}
        />
      )}
    </div>
  )
}
