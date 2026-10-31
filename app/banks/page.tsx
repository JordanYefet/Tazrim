import { cookies } from 'next/headers'
import { Building2, FileSpreadsheet, Upload } from 'lucide-react'
import { columnsCookie, parseColumns } from '@/lib/tables/columns'
import { cn } from '@/lib/utils/cn'
import { bankStats } from '@/components/bank/bank-summary-cards'
import { StatPanel } from '@/components/dashboard/summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BankSummaryRow } from '@/components/accounts/account-cards'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getBankBalancePoints, getBankMonthlySummary, getBankTransactions } from '@/lib/db/bank'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'
import { FlowFilter } from '@/components/bank/flow-filter'
import type { TableAccount } from '@/components/accounts/account-tag'
import { getBankCategoryMonthly } from '@/lib/db/bank-categories'
import { withCategorySuggestions } from '@/lib/db/category-suggestions'
import { getCategories } from '@/lib/db/categories'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { asJson } from '@/lib/db/summary'
import { parseBankFlow } from '@/lib/insights/bank-categories'
import { rankCategories } from '@/lib/insights/category-insights'
import { recurringNameMap } from '@/lib/insights/recurring-overrides'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { combinedBalance } from '@/lib/insights/combined-balance'
import { BANK_COLORS } from '@/lib/nav/state'
import { seriesColor } from '@/lib/accounts/colors'
import { accountHref, accountPath } from '@/lib/accounts/routes'
import { bankCategoryAnalysisHref } from '@/lib/accounts/category-links'
import { CardStackTotal } from '@/components/cards/card-wallet'
import {
  bankPeriodTotals,
  lastMonthWithData,
  monthHasData,
  shareOf,
  sumBankMonthly,
} from '@/lib/insights/account-overview'
import { monthName } from '@/lib/utils/date'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams {
  year?: string
  month?: string
  // The table's filters, as on an account's page (they narrow the table only)
  search?: string
  merchant?: string
  category?: string
  /** in = income only, out = expenses only */
  flow?: string
  showIgnored?: string
}

/**
 * Every listed account's rows for the table: the same query, flags and categories
 * as an account's page (app/banks/[accountId]/page.tsx), over all of them
 */
async function getTableData(ids: string[], params: SearchParams & { year: string }) {
  const year = Number(params.year)
  const month = params.month ? Number(params.month) : undefined
  const [txs, insights, categories, genericDescriptions] = await Promise.all([
    // Same query as /api/bank/transactions?accountId=… (first page of 50 unless a month is selected)
    getBankTransactions({
      accountId: ids,
      year,
      month,
      search: params.search,
      merchant: params.merchant,
      category: params.category,
      direction: parseBankFlow(params.flow),
      showIgnored: params.showIgnored === 'true',
      take: month ? undefined : 50,
    }).then(withCategorySuggestions),
    // Flags for the whole year, so rows loaded with "load more" get badges too
    getRecurringSeries().then(async r => ({
      flags: await getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } }),
      recurring: recurringNameMap(r.series, ids),
    })),
    // The pills' colours, ranked by the year across the accounts (as the analysis page does)
    Promise.all([
      getBankCategoryMonthly(ids, year, 'OUT'),
      getBankCategoryMonthly(ids, year, 'IN'),
      getCategories('EXPENSE'),
      getCategories('INCOME'),
    ]),
    listGenericDescriptions(),
  ])
  const [expenseMonthly, incomeMonthly, expenseCategories, incomeCategories] = categories
  return {
    transactions: asJson(txs),
    unusual: insights.flags.bank,
    recurring: insights.recurring,
    categoryColors: { ...categoryColorMap(rankCategories(incomeMonthly)), ...categoryColorMap(rankCategories(expenseMonthly)) },
    expenseCategories: asJson(expenseCategories),
    incomeCategories: asJson(incomeCategories),
    genericDescriptions,
  }
}

/** Every (non-archived) bank account: the wallet's stack (layout), the combined summary beside it. */
export default async function BanksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }

  const accounts = await listAccounts({ kind: 'BANK' })
  const perAccount = await Promise.all(
    accounts.map(async (account, i) => {
      const [monthly, [latest], balancePoints] = await Promise.all([
        getBankMonthlySummary(Number(year), account.id),
        // newest row in the period: its balance is the account's balance then
        getBankTransactions({ accountId: account.id, year: Number(year), month, take: 1 }),
        getBankBalancePoints(account.id, Number(year), month),
      ])
      const color = seriesColor(account.color, BANK_COLORS[i % BANK_COLORS.length])
      return { account, monthly, latest, balancePoints, color, totals: bankPeriodTotals(monthly, month) }
    })
  )

  // Bank accounts only: card charges are already inside these expenses
  const combined = sumBankMonthly(perAccount.map(a => a.monthly))
  const totals = bankPeriodTotals(combined, month)
  const chartData = Object.entries(combined).map(([m, d]) => ({ month: Number(m), ...d }))
  const hasData = lastMonthWithData(combined) > 0
  const several = accounts.length > 1

  // On the navy pocket: the balance across the accounts (each one's latest row in the period)
  const stackBalance = perAccount.reduce((sum, a) => sum + (a.latest?.balance ?? 0), 0)

  const heading = (
    <PageHeading period={{ year: Number(year), month }} title="בנקים">
      <ManageAccountsLink />
    </PageHeading>
  )

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {heading}
        <EmptyState
          icon={Building2}
          title="אין חשבונות בנק"
          text="הוסף חשבון בנק או העלה קובץ תנועות כדי לראות כאן את ההכנסות וההוצאות."
          actions={[
            { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
            { href: '/settings#accounts', label: 'ניהול חשבונות' },
          ]}
        />
      </div>
    )
  }

  // The table below the charts: every account's rows
  const table = await getTableData(accounts.map(a => a.id), params)
  const tableAccounts: TableAccount[] = perAccount.map(({ account, color }) => ({
    id: account.id,
    name: account.displayName,
    color,
    provider: account.provider,
  }))
  const flow = parseBankFlow(params.flow)
  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.category) fetchSp.set('category', params.category)
  if (params.flow) fetchSp.set('flow', params.flow)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !month && table.transactions.length >= 50

  // The accounts themselves are the wallet in app/banks/layout.tsx; this page
  // fills the grid around it, as /cards does (components/cards/card-wallet.tsx, .wallet-shell)
  return (
    <div className="contents">
      <div className="wallet-shell__head">{heading}</div>
      <CardStackTotal value={stackBalance} />

      {/* Beside the wallet, as tall as it: each account's figures (as the card list on /cards),
          then the four period figures in a compact card filling the rest */}
      <div className={cn('wallet-shell__beside flex flex-col gap-3', hasData && 'wallet-shell__beside--fit')}>
        <ul className="divide-y overflow-hidden rounded-xl surface">
          {perAccount.map(({ account, latest, color, totals: t }) => (
            <BankSummaryRow
              key={account.id}
              href={accountHref('BANK', account.id, period)}
              name={account.displayName}
              provider={account.provider}
              color={color}
              colorChoice={account.color}
              expense={t.expense}
              balance={latest?.balance}
              expenseShare={several ? shareOf(t.expense, totals.expense) : undefined}
            />
          ))}
        </ul>
        {hasData ? (
          <StatPanel
            compact
            className="min-h-0 flex-1"
            stats={bankStats({
              income: totals.income,
              expense: totals.expense,
              averageExpense: totals.averageExpense,
              averageIncome: totals.averageIncome,
              monthLabel: month ? monthName(month) : undefined,
              monthHasData: !!month && monthHasData(combined, month),
            })}
          />
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title={`אין תנועות בנק לשנת ${year}`}
            text="העלה קובץ תנועות מהבנק כדי לראות כאן את התזרים החודשי."
            actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
          />
        )}
      </div>

      <div className="wallet-shell__rest space-y-6">
        {/* The same pair as on an account's page: income vs. expenses, and the balance
            (every account's together) with the category analysis link */}
        {hasData && (
          <div className="grid gap-4 lg:grid-cols-2">
            <IncomeExpenseChart
              data={chartData}
              selectedMonth={month}
              flow={flow}
              subtitle={several ? 'כל חשבונות הבנק יחד · לחיצה על חודש מסננת' : undefined}
            />
            <BalanceChart
              data={combinedBalance(perAccount.map(a => a.balancePoints))}
              subtitle={several ? 'כל החשבונות יחד · כל התנועות בתקופה' : undefined}
              analysisHref={bankCategoryAnalysisHref(undefined, period)}
            />
          </div>
        )}

        {/* Every account's rows together, as on an account's page; card payments stay,
            as bank money going out */}
        {(hasData || table.transactions.length > 0 || params.showIgnored === 'true' || params.merchant || params.search || params.category) && (
          <BankTransactionsTable
            key={[params.merchant, params.search, params.month, params.year, params.category, params.flow, params.showIgnored].join('|')}
            accounts={tableAccounts}
            transactions={table.transactions}
            showIgnored={params.showIgnored === 'true'}
            hasMore={hasMore}
            fetchParams={hasMore ? fetchSp.toString() : undefined}
            unusual={table.unusual}
            recurring={table.recurring}
            initialColumns={parseColumns((await cookies()).get(columnsCookie('bank'))?.value, 'bank')}
            expenseCategories={table.expenseCategories}
            incomeCategories={table.incomeCategories}
            categoryColors={table.categoryColors}
            genericDescriptions={table.genericDescriptions}
            activeCategory={params.category}
            flowFilter={<FlowFilter basePath={accountPath('BANK')} params={params} current={flow} />}
          />
        )}
      </div>
    </div>
  )
}
