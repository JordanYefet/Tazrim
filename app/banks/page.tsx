import { Building2, FileSpreadsheet, Upload } from 'lucide-react'
import { BankSummaryCards } from '@/components/bank/bank-summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BankAccountCard } from '@/components/accounts/account-cards'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getBankBalanceTrend, getBankMonthlySummary, getBankTransactions } from '@/lib/db/bank'
import { BANK_COLORS } from '@/lib/nav/state'
import { accountHref } from '@/lib/accounts/routes'
import {
  bankPeriodTotals,
  lastMonthWithData,
  plottedMonthCount,
  shareOf,
  sumBankMonthly,
} from '@/lib/insights/account-overview'
import { monthName } from '@/lib/utils/date'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams { year?: string; month?: string }

/** Every (non-archived) bank account: combined summary and one card per account. */
export default async function BanksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }

  const accounts = await listAccounts({ kind: 'BANK' })
  const perAccount = await Promise.all(
    accounts.map(async (account, i) => {
      const [monthly, [latest], trend] = await Promise.all([
        getBankMonthlySummary(Number(year), account.id),
        // newest row in the period: its balance is the account's balance then
        getBankTransactions({ accountId: account.id, year: Number(year), month, take: 1 }),
        getBankBalanceTrend(account.id, Number(year), month),
      ])
      const color = BANK_COLORS[i % BANK_COLORS.length]
      return { account, monthly, latest, trend, color, totals: bankPeriodTotals(monthly, month) }
    })
  )

  // Bank accounts only: card charges are already inside these expenses
  const combined = sumBankMonthly(perAccount.map(a => a.monthly))
  const totals = bankPeriodTotals(combined, month)
  const chartData = Object.entries(combined).map(([m, d]) => ({ month: Number(m), ...d }))
  const monthCount = plottedMonthCount(Number(year), lastMonthWithData(combined))
  const hasData = lastMonthWithData(combined) > 0
  const several = accounts.length > 1

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading period={{ year: Number(year), month }} title="בנקים">
        <ManageAccountsLink />
      </PageHeading>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="אין חשבונות בנק"
          text="הוסף חשבון בנק או העלה קובץ תנועות כדי לראות כאן את ההכנסות וההוצאות."
          actions={[
            { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
            { href: '/settings#accounts', label: 'ניהול חשבונות' },
          ]}
        />
      ) : (
        <>
          {hasData ? (
            <>
              <BankSummaryCards
                income={totals.income}
                expense={totals.expense}
                averageExpense={totals.averageExpense}
                monthLabel={month ? monthName(month) : undefined}
              />
              <IncomeExpenseChart
                data={chartData}
                selectedMonth={month}
                monthCount={monthCount}
                subtitle={several ? 'כל חשבונות הבנק יחד · לחיצה על חודש מסננת' : undefined}
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

          <section aria-labelledby="bank-accounts" className="space-y-3">
            <h2 id="bank-accounts" className="text-base font-semibold">
              {several ? `החשבונות (${accounts.length})` : 'החשבון'}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perAccount.map(({ account, latest, trend, color, totals: t }) => (
                <BankAccountCard
                  key={account.id}
                  href={accountHref('BANK', account.id, period)}
                  name={account.displayName}
                  provider={account.provider}
                  color={color}
                  trend={trend.map(p => p.balance)}
                  income={t.income}
                  expense={t.expense}
                  latest={latest ? { balance: latest.balance, date: latest.date.toISOString() } : undefined}
                  expenseShare={several ? shareOf(t.expense, totals.expense) : undefined}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
