import { notFound } from 'next/navigation'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { BankSummaryCards } from '@/components/bank/bank-summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { BankElement } from '@/components/accounts/account-element'
import { getBankBalanceTrend, getBankMonthlySummary, getBankTransactions } from '@/lib/db/bank'
import { getBankCategoryMonthly, getBankCategoryStats } from '@/lib/db/bank-categories'
import { getCategories } from '@/lib/db/categories'
import { CategoryDonut } from '@/components/cards/category-donut'
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
import { accountHref, accountPath } from '@/lib/accounts/routes'
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

  // Same query as /api/bank/transactions?accountId= (first page of 50 unless a month is selected)
  const [txs, monthly, insights, [latest], trend, categories] = await Promise.all([
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
    getBankMonthlySummary(Number(year), accountId),
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
    // The donuts (period) and their colours (ranked by the year, like the card pages)
    Promise.all([
      getBankCategoryStats(accountId, Number(year), month, 'OUT'),
      getBankCategoryStats(accountId, Number(year), month, 'IN'),
      getBankCategoryMonthly(accountId, Number(year), 'OUT'),
      getBankCategoryMonthly(accountId, Number(year), 'IN'),
      getCategories('EXPENSE'),
      getCategories('INCOME'),
    ]),
  ])
  const [expenseStats, incomeStats, expenseMonthly, incomeMonthly, expenseCategories, incomeCategories] = categories

  return {
    latest: latest ? { balance: latest.balance, date: latest.date.toISOString() } : undefined,
    trend: trend.map(p => p.balance),
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
    expenseStats,
    incomeStats,
    expenseColors,
    incomeColors,
    expenseCategories,
    incomeCategories,
  } = await getBankData(account.id, params)

  const { income, expense, averageExpense, averageIncome } = bankPeriodTotals(bankSummary, month)

  const chartData = Object.entries(bankSummary).map(([m, d]) => ({
    month: Number(m),
    income: d.income,
    expense: d.expense,
  }))

  const balancePoints = transactions.map((tx: { date: string; balance: number }) => ({
    date: tx.date,
    balance: tx.balance,
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={{ year: Number(year), month }}
        title={account.displayName}
        back={{ href: accountHref('BANK', undefined, { ...period, flow: params.flow }), label: 'בנקים' }}
        badge={account.archived ? 'בארכיון' : undefined}
      />

      {/* The account itself is the page's hero, next to the period totals on wide screens */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <BankElement
          hero
          tilt
          provider={account.provider}
          name={account.displayName}
          color="var(--chart-income)"
          colorChoice={account.color}
          latest={latest}
          trend={trend}
          emptyText="אין תנועות בתקופה"
        />
        {hasData ? (
          <BankSummaryCards
            income={income}
            expense={expense}
            averageExpense={averageExpense}
            averageIncome={averageIncome}
            monthLabel={month ? monthName(month) : undefined}
            monthHasData={!!month && monthHasData(bankSummary, month)}
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

      {hasData && (
        <>
          {/* Same 5/7 split as the summary row above, so the edges line up */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <IncomeExpenseChart data={chartData} selectedMonth={month} accountId={account.id} flow={flow} />
            <BalanceChart data={balancePoints} />
          </div>
          {/* Where the money went and where it came from; a slice filters the table */}
          <div className={flow ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}>
            {flow !== 'IN' && (
            <CategoryDonut
              pagePath={accountPath('BANK', account.id)}
              data={totalsOf(expenseStats)}
              stats={expenseStats}
              selectedCategory={params.category}
              colors={expenseColors}
              analysisHref={bankCategoryAnalysisHref(account.id, period)}
              emptyText="אין הוצאות לתקופה זו"
            />
            )}
            {flow !== 'OUT' && (
            <CategoryDonut
              pagePath={accountPath('BANK', account.id)}
              data={totalsOf(incomeStats)}
              stats={incomeStats}
              selectedCategory={params.category}
              colors={incomeColors}
              title="הכנסות לפי קטגוריה"
              tone="income"
              emptyText="אין הכנסות לתקופה זו"
              analysisHref={flow === 'IN' ? bankCategoryAnalysisHref(account.id, period) : undefined}
            />
            )}
          </div>
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
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          activeCategory={params.category}
          flowFilter={<FlowFilter basePath={accountPath('BANK', account.id)} params={params} current={flow} />}
        />
      )}
    </div>
  )
}
