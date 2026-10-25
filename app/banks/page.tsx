import { Building2, FileSpreadsheet, Upload } from 'lucide-react'
import { bankStats } from '@/components/bank/bank-summary-cards'
import { NetBalance, StatPanel } from '@/components/dashboard/summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BankSummaryRow } from '@/components/accounts/account-cards'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getBankBalancePoints, getBankMonthlySummary, getBankTransactions } from '@/lib/db/bank'
import { BalanceChart } from '@/components/bank/balance-chart'
import { combinedBalance } from '@/lib/insights/combined-balance'
import { BANK_COLORS } from '@/lib/nav/state'
import { seriesColor } from '@/lib/accounts/colors'
import { accountHref } from '@/lib/accounts/routes'
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

interface SearchParams { year?: string; month?: string }

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

  // The accounts themselves are the wallet in app/banks/layout.tsx; this page
  // fills the grid around it, as /cards does (components/cards/card-wallet.tsx, .wallet-shell)
  return (
    <div className="contents">
      <div className="wallet-shell__head">{heading}</div>
      <CardStackTotal value={stackBalance} />

      {/* Beside the wallet: each account's figures (as the card list on /cards), then the net
          balance and the four period figures in a compact card. Together they are taller than
          the wallet, so the column sets the row's height here (no --fit) */}
      <div className="wallet-shell__beside flex flex-col gap-3">
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
          <>
            <NetBalance compact bankIncome={totals.income} bankExpense={totals.expense} format="currencyExact" />
            <StatPanel
              compact
              stats={bankStats({
                income: totals.income,
                expense: totals.expense,
                averageExpense: totals.averageExpense,
                averageIncome: totals.averageIncome,
                monthLabel: month ? monthName(month) : undefined,
                monthHasData: !!month && monthHasData(combined, month),
              })}
            />
          </>
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
              subtitle={several ? 'כל חשבונות הבנק יחד · לחיצה על חודש מסננת' : undefined}
            />
            <BalanceChart
              data={combinedBalance(perAccount.map(a => a.balancePoints))}
              subtitle={several ? 'כל החשבונות יחד · כל התנועות בתקופה' : undefined}
              analysisHref={bankCategoryAnalysisHref(undefined, period)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
