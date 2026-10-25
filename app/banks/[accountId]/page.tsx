import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { columnsCookie, parseColumns } from '@/lib/tables/columns'
import { cn } from '@/lib/utils/cn'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { bankStats } from '@/components/bank/bank-summary-cards'
import { NetBalance, StatPanel } from '@/components/dashboard/summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { BankHeroBalance } from '@/components/cards/card-wallet'
import { getBankBalancePoints, getBankBalanceTrend, getBankMonthlySummary, getBankTransactions } from '@/lib/db/bank'
import { getBankCategoryMonthly, getBankCategoryStats } from '@/lib/db/bank-categories'
import { getCategories } from '@/lib/db/categories'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { CategoryDonut } from '@/components/cards/category-donut'
import { CollapsiblePair } from '@/components/ui/collapsible-pair'
import { bankCategoryAnalysisHref } from '@/lib/accounts/category-links'
import { rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { getAccount } from '@/lib/db/accounts'
import { FlowFilter } from '@/components/bank/flow-filter'
import { parseBankFlow } from '@/lib/insights/bank-categories'
import { asJson } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { recurringNameMap } from '@/lib/insights/recurring-overrides'
import { accountPath } from '@/lib/accounts/routes'
import { bankPeriodTotals, lastMonthWithData, monthHasData, type BankMonthly } from '@/lib/insights/account-overview'
import { monthName, periodLabel } from '@/lib/utils/date'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams {
  year?: string
  month?: string
  search?: string
  merchant?: string
  category?: string
  /** in = income only, out = expenses only */
  flow?: string
  showIgnored?: string
}

async function getBankData(accountId: string, params: SearchParams & { year: string }) {
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  // A merchant or search filter narrows the income/expense figures, chart and donuts too,
  // not only the table (ENG-83); the balance stays the account's. A category narrows
  // the figures and chart; the donuts keep every category, the selected one highlighted.
  const chartFilter = { merchant: params.merchant, search: params.search }

  // Same query as /api/bank/transactions?accountId= (first page of 50 unless a month is selected)
  const [txs, monthly, insights, [latest], trend, balancePoints, categories, genericDescriptions] = await Promise.all([
    getBankTransactions({
      accountId,
      year: Number(year),
      month,
      search: params.search,
      merchant: params.merchant,
      category: params.category,
      direction: parseBankFlow(params.flow),
      showIgnored: params.showIgnored === 'true',
      take: month ? undefined : 50,
    }),
    getBankMonthlySummary(Number(year), accountId, { ...chartFilter, category: params.category }),
    // Flags for the whole year, so rows loaded with "load more" get badges too
    // recurring charges are exempt from the outlier checks (ENG-37)
    // and the table marks rows that are already recurring (ENG-71)
    getRecurringSeries().then(async r => ({
      flags: await getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } }),
      recurring: recurringNameMap(r.series, accountId),
    })),
    // The hero's balance: the newest row of the period, whatever the table filters
    getBankTransactions({ accountId, year: Number(year), month, take: 1 }),
    getBankBalanceTrend(accountId, Number(year), month),
    // The balance chart: every row of the period, whatever the table filters
    getBankBalancePoints(accountId, Number(year), month),
    // The donuts (period) and their colours (ranked by the year, like the card pages)
    Promise.all([
      getBankCategoryStats(accountId, Number(year), month, 'OUT', chartFilter),
      getBankCategoryStats(accountId, Number(year), month, 'IN', chartFilter),
      getBankCategoryMonthly(accountId, Number(year), 'OUT'),
      getBankCategoryMonthly(accountId, Number(year), 'IN'),
      getCategories('EXPENSE'),
      getCategories('INCOME'),
    ]),
    listGenericDescriptions(),
  ])
  const [expenseStats, incomeStats, expenseMonthly, incomeMonthly, expenseCategories, incomeCategories] = categories

  return {
    latest: latest ? { balance: latest.balance, date: latest.date.toISOString() } : undefined,
    trend: trend.map(p => p.balance),
    balancePoints,
    transactions: asJson(txs),
    unusual: insights.flags.bank,
    recurring: insights.recurring,
    bankSummary: monthly as BankMonthly,
    expenseStats,
    incomeStats,
    expenseColors: categoryColorMap(rankCategories(expenseMonthly)),
    incomeColors: categoryColorMap(rankCategories(incomeMonthly)),
    expenseCategories: asJson(expenseCategories),
    incomeCategories: asJson(incomeCategories),
    genericDescriptions,
  }
}

const totalsOf = (stats: Record<string, { total: number }>) =>
  Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.total]))

export default async function BankAccountPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { accountId } = await routeParams
  const account = await getAccount(decodeURIComponent(accountId))
  if (!account || account.kind !== 'BANK') notFound()

  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const {
    transactions,
    bankSummary,
    unusual,
    recurring,
    latest,
    trend,
    balancePoints,
    expenseStats,
    incomeStats,
    expenseColors,
    incomeColors,
    expenseCategories,
    incomeCategories,
    genericDescriptions,
  } = await getBankData(account.id, params)

  const { income, expense, averageExpense, averageIncome } = bankPeriodTotals(bankSummary, month)

  const chartData = Object.entries(bankSummary).map(([m, d]) => ({
    month: Number(m),
    income: d.income,
    expense: d.expense,
  }))


  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.category) fetchSp.set('category', params.category)
  if (params.flow) fetchSp.set('flow', params.flow)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !month && transactions.length >= 50

  const hasData = lastMonthWithData(bankSummary) > 0 || transactions.length > 0
  const period = { year, ...(month ? { month: String(month) } : {}) }
  const flow = parseBankFlow(params.flow)

  // The account itself is the open bank element in the wallet (app/banks/layout.tsx);
  // this page fills the grid around it, as a card's page does
  return (
    <div className="contents">
      <BankHeroBalance accountId={account.id} latest={latest} trend={trend} />
      <div className="wallet-shell__head">
      <PageHeading
        period={{ year: Number(year), month }}
        // The account's name is on its element in the wallet: the page keeps the section's title
        title="בנקים"
        badge={account.archived ? 'בארכיון' : undefined}
      />
      </div>

      {/* Beside the open account, as tall as it: the net balance over the four period figures in one card */}
      <div className={cn('wallet-shell__beside flex flex-col gap-3', hasData && 'wallet-shell__beside--fit')}>
        {hasData && <NetBalance compact bankIncome={income} bankExpense={expense} format="currencyExact" />}
        {hasData ? (
          <StatPanel
            className="min-h-0 flex-1"
            stats={bankStats({
              income,
              expense,
              averageExpense,
              averageIncome,
              monthLabel: month ? monthName(month) : undefined,
              monthHasData: !!month && monthHasData(bankSummary, month),
            })}
          />
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title={month ? `אין תנועות ב${periodLabel(year, month)}` : `אין תנועות לשנת ${year}`}
            text={`העלה קובץ תנועות של ${account.displayName} כדי לראות כאן הכנסות, הוצאות ויתרה.`}
            actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
          />
        )}
      </div>

      <div className="wallet-shell__rest space-y-6">
      {hasData && (
        <>
          {/* Two equal halves, like the rows above and below */}
          <div className="grid gap-4 lg:grid-cols-2">
            <IncomeExpenseChart data={chartData} selectedMonth={month} accountId={account.id} flow={flow} />
            <BalanceChart data={balancePoints} analysisHref={bankCategoryAnalysisHref(account.id, period)} />
          </div>
          {/* Where the money came from (start side) and where it went; a slice filters the table.
              The switch collapses the other side instead of dropping it. */}
          <CollapsiblePair
            show={flow === 'IN' ? 'first' : flow === 'OUT' ? 'second' : 'both'}
            first={
              <CategoryDonut
                pagePath={accountPath('BANK', account.id)}
                data={totalsOf(incomeStats)}
                stats={incomeStats}
                selectedCategory={params.category}
                colors={incomeColors}
                title="הכנסות לפי קטגוריה"
                tone="income"
                emptyText="אין הכנסות לתקופה זו"
              />
            }
            second={
              <CategoryDonut
                pagePath={accountPath('BANK', account.id)}
                data={totalsOf(expenseStats)}
                stats={expenseStats}
                selectedCategory={params.category}
                colors={expenseColors}
                emptyText="אין הוצאות לתקופה זו"
              />
            }
          />
        </>
      )}

      {(hasData || params.showIgnored === 'true' || params.merchant || params.search || params.category) && (
        <BankTransactionsTable
          key={[params.merchant, params.month, params.year, params.category, params.flow, params.showIgnored].join('|')}
          accountId={account.id}
          transactions={transactions}
          showIgnored={params.showIgnored === 'true'}
          hasMore={hasMore}
          fetchParams={hasMore ? fetchSp.toString() : undefined}
          unusual={unusual}
          recurring={recurring}
          initialColumns={parseColumns((await cookies()).get(columnsCookie('bank'))?.value, 'bank')}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          genericDescriptions={genericDescriptions}
          activeCategory={params.category}
          flowFilter={<FlowFilter basePath={accountPath('BANK', account.id)} params={params} current={flow} />}
        />
      )}
      </div>
    </div>
  )
}
