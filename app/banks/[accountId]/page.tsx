import { notFound } from 'next/navigation'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { BankSummaryCards } from '@/components/bank/bank-summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { getBankMonthlySummary, getBankTransactions } from '@/lib/db/bank'
import { getAccount } from '@/lib/db/accounts'
import { asJson } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { accountHref } from '@/lib/accounts/routes'
import { bankPeriodTotals, lastMonthWithData, plottedMonthCount, type BankMonthly } from '@/lib/insights/account-overview'
import { monthName, periodLabel } from '@/lib/utils/date'

interface SearchParams {
  year?: string
  month?: string
  search?: string
  merchant?: string
  showIgnored?: string
}

async function getBankData(accountId: string, params: SearchParams) {
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined

  // Same query as /api/bank/transactions?accountId= (first page of 50 unless a month is selected)
  const [txs, monthly, unusual] = await Promise.all([
    getBankTransactions({
      accountId,
      year: Number(year),
      month,
      search: params.search,
      merchant: params.merchant,
      showIgnored: params.showIgnored === 'true',
      take: month ? undefined : 50,
    }),
    getBankMonthlySummary(Number(year), accountId),
    // Flags for the whole year, so rows loaded with "load more" get badges too
    // recurring charges are exempt from the outlier checks (ENG-37)
    getRecurringSeries().then(r =>
      getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } })
    ),
  ])

  return {
    transactions: asJson(txs),
    unusual: unusual.bank,
    bankSummary: monthly as BankMonthly,
  }
}

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

  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined
  const { transactions, bankSummary, unusual } = await getBankData(account.id, params)

  const { income, expense, averageExpense } = bankPeriodTotals(bankSummary, month)

  const chartData = Object.entries(bankSummary).map(([m, d]) => ({
    month: Number(m),
    income: d.income,
    expense: d.expense,
  }))
  const monthCount = plottedMonthCount(Number(year), lastMonthWithData(bankSummary))

  const balancePoints = transactions.map((tx: { date: string; balance: number }) => ({
    date: tx.date,
    balance: tx.balance,
  }))

  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !params.month && transactions.length >= 50

  const hasData = lastMonthWithData(bankSummary) > 0 || transactions.length > 0
  const period = { year, ...(month ? { month: String(month) } : {}) }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={periodLabel(year, month)}
        title={account.displayName}
        back={{ href: accountHref('BANK', undefined, period), label: 'בנקים' }}
        badge={account.archived ? 'בארכיון' : undefined}
      />

      {hasData ? (
        <>
          <BankSummaryCards
            income={income}
            expense={expense}
            averageExpense={averageExpense}
            monthLabel={month ? monthName(month) : undefined}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <IncomeExpenseChart data={chartData} selectedMonth={month} accountId={account.id} monthCount={monthCount} />
            <BalanceChart data={balancePoints} />
          </div>
        </>
      ) : (
        <EmptyState
          icon={FileSpreadsheet}
          title={month ? `אין תנועות ב${periodLabel(year, month)}` : `אין תנועות לשנת ${year}`}
          text={`העלה קובץ תנועות של ${account.displayName} כדי לראות כאן הכנסות, הוצאות ויתרה.`}
          actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
        />
      )}

      {(hasData || params.showIgnored === 'true' || params.merchant || params.search) && (
        <BankTransactionsTable
          key={[params.merchant, params.month, params.year, params.showIgnored].join('|')}
          accountId={account.id}
          transactions={transactions}
          showIgnored={params.showIgnored === 'true'}
          hasMore={hasMore}
          fetchParams={hasMore ? fetchSp.toString() : undefined}
          unusual={unusual}
        />
      )}
    </div>
  )
}
