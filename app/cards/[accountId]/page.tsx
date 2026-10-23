import { notFound } from 'next/navigation'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { CardStatTiles } from '@/components/cards/card-summary-cards'
import { CardHeroTotal } from '@/components/cards/card-wallet'
import { CategoryDonut } from '@/components/cards/category-donut'
import { MonthlySpendingChart } from '@/components/cards/monthly-spending-chart'
import { CardTransactionsTable } from '@/components/cards/card-transactions-table'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { getCCCategoryMonthly, getCCCategoryStats, getCCMonthlyCounts, getCCMonthlySummary, getCCTransactions } from '@/lib/db/cards'
import { getAccount } from '@/lib/db/accounts'
import { seriesColor } from '@/lib/accounts/colors'
import { getCategories } from '@/lib/db/categories'
import { asJson } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { recurringNameMap } from '@/lib/insights/recurring-overrides'
import { rankCategories } from '@/lib/insights/category-insights'
import { lastMonthWithData, monthHasData, monthlyAverage } from '@/lib/insights/account-overview'
import { accountPath } from '@/lib/accounts/routes'
import { categoryAnalysisHref } from '@/lib/accounts/category-links'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { monthName } from '@/lib/utils/date'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams {
  year?: string
  month?: string
  search?: string
  merchant?: string
  category?: string
  showIgnored?: string
}

async function getCardData(accountId: string, params: SearchParams & { year: string }) {
  const year = params.year
  const month = params.month ? Number(params.month) : undefined

  // Same query as /api/cards/[accountId]/transactions (first page of 50 unless a month is selected)
  const [txs, monthly, categoryRows, insights, stats, categoryMonthly, monthlyCounts] = await Promise.all([
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
    getCategories('EXPENSE'),
    // Flags for the whole year (every account's history as baseline), so "load more" rows get badges too
    // recurring charges are exempt from the outlier checks (ENG-37)
    // and the table marks rows that are already recurring (ENG-71)
    getRecurringSeries().then(async r => ({
      flags: await getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } }),
      recurring: recurringNameMap(r.series, accountId),
    })),
    getCCCategoryStats(accountId, Number(year), month),
    getCCCategoryMonthly(accountId, Number(year)),
    // The count tile's monthly bars (following the category filter, like its figure)
    getCCMonthlyCounts(accountId, Number(year), { category: params.category }),
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
    monthlyCounts,
    unusual: insights.flags.card,
    recurring: insights.recurring,
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

  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const { transactions, monthly, categoryTotals, categoryStats, categories, categoryMonthly, monthlyCounts, unusual, recurring } =
    await getCardData(account.id, params)

  const total = params.category
    ? (categoryStats[params.category]?.total ?? 0)
    : Object.values(categoryStats).reduce((s, v) => s + v.total, 0)
  const count = params.category
    ? (categoryStats[params.category]?.count ?? 0)
    : Object.values(categoryStats).reduce((s, v) => s + v.count, 0)

  // Yearly average over months with charges (not all 12 the chart shows); with a
  // category filter, that category's yearly total over the same months (as the
  // category page's table averages it). Always shown, so a month can be compared.
  const averageMonthly = monthlyAverage(
    params.category ? (categoryMonthly[params.category] ?? {}) : monthly,
    monthly
  )

  // Same category colors on every chart, ranked by yearly spend
  const categoryColors = categoryColorMap(rankCategories(categoryMonthly))

  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.category) fetchSp.set('category', params.category)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !month && transactions.length >= 50

  const hasData = lastMonthWithData(monthly) > 0 || transactions.length > 0
  const period = { year, ...(month ? { month: String(month) } : {}) }

  // The card itself is the wallet in app/cards/layout.tsx (open on this page);
  // this page fills the grid around it (components/cards/card-wallet.tsx)
  return (
    <div className="contents">
      <div className="wallet-shell__head">
        <PageHeading
          period={{ year: Number(year), month }}
          // The card's name is on the card in the wallet: the page keeps the section's title
          title="כרטיסי אשראי"
          badge={account.archived ? 'בארכיון' : undefined}
        />
      </div>

      <div className="wallet-shell__beside flex flex-col [&>*]:flex-1">
        {hasData ? (
          <>
            {/* The period total goes on the open card (the wallet, in the layout) */}
            <CardHeroTotal
              accountId={account.id}
              value={total}
              label={params.category ? `חיובים · ${params.category}` : 'סה״כ חיובים'}
            />
            <CardStatTiles total={total} count={count} average={averageMonthly} monthLabel={month ? monthName(month) : undefined}
              monthHasData={!!month && monthHasData(monthly, month)}
              monthlyCounts={monthlyCounts}
              monthlyTotals={params.category ? (categoryMonthly[params.category] ?? {}) : monthly}
              selectedMonth={month}
            />
          </>
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title={`אין חיובים לשנת ${year}`}
            text={`העלה פירוט חיובים של ${account.displayName} כדי לראות כאן את החיובים לפי חודש וקטגוריה.`}
            actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
          />
        )}
      </div>

      <div className="wallet-shell__rest space-y-6">
        {hasData && (
          /* Monthly bar chart + category donut side by side on large screens */
          <div className="grid gap-4 lg:grid-cols-2">
            <MonthlySpendingChart
              accountId={account.id}
              series={[{ key: account.id, label: account.displayName, color: seriesColor(account.color, 'var(--chart-cc)'), data: monthly }]}
              selectedMonth={month}
            />
            <CategoryDonut
              pagePath={accountPath('CREDIT_CARD', account.id)}
              data={categoryTotals}
              stats={categoryStats}
              selectedCategory={params.category}
              colors={categoryColors}
              analysisHref={categoryAnalysisHref(account.id, period)}
            />
          </div>
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
            recurring={recurring}
          />
        )}
      </div>
    </div>
  )
}
