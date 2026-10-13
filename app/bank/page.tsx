import { BankSummaryCards } from '@/components/bank/bank-summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'
import { getBankTransactions } from '@/lib/db/bank'
import { asJson, getYearSummary } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'

interface SearchParams {
  year?: string
  month?: string
  search?: string
  merchant?: string
  showIgnored?: string
}

async function getBankData(params: SearchParams) {
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined

  // Same query as /api/bank/transactions (first page of 50 unless a month is selected)
  const [txs, yearSummary, unusual] = await Promise.all([
    getBankTransactions({
      year: Number(year),
      month,
      search: params.search,
      merchant: params.merchant,
      showIgnored: params.showIgnored === 'true',
      take: month ? undefined : 50,
    }),
    getYearSummary(Number(year)),
    // Flags for the whole year, so rows loaded with "load more" get badges too
    // recurring charges are exempt from the outlier checks (ENG-37)
    getRecurringSeries().then(r =>
      getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } })
    ),
  ])

  const transactions = asJson(txs)
  const summary = asJson(yearSummary)
  return {
    transactions,
    unusual: unusual.bank,
    bankSummary: summary.bank as Record<string, { income: number; expense: number }>,
  }
}

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const { transactions, bankSummary, unusual } = await getBankData(params)
  const month = params.month ? Number(params.month) : undefined

  const income = month
    ? (bankSummary[String(month)]?.income ?? 0)
    : Object.values(bankSummary).reduce((s, m) => s + m.income, 0)
  const expense = month
    ? (bankSummary[String(month)]?.expense ?? 0)
    : Object.values(bankSummary).reduce((s, m) => s + m.expense, 0)

  const averageExpense = !month
    ? expense / Math.max(Object.values(bankSummary).filter(m => m.expense > 0).length, 1)
    : undefined

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
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !params.month && transactions.length >= 50

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">בנק לאומי</h1>
      <BankSummaryCards income={income} expense={expense} averageExpense={averageExpense} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IncomeExpenseChart data={chartData} selectedMonth={month} />
        <BalanceChart data={balancePoints} />
      </div>
      <BankTransactionsTable
        key={[params.merchant, params.month, params.year, params.showIgnored].join('|')}
        transactions={transactions}
        showIgnored={params.showIgnored === 'true'}
        hasMore={hasMore}
        fetchParams={hasMore ? fetchSp.toString() : undefined}
        unusual={unusual}
      />
    </div>
  )
}
