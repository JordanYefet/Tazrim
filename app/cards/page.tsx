import { CreditCard, FileSpreadsheet, Upload } from 'lucide-react'
import { CardSummaryCards } from '@/components/cards/card-summary-cards'
import { MonthlySpendingChart } from '@/components/cards/monthly-spending-chart'
import { CardSummaryRow } from '@/components/accounts/account-cards'
import { CardStackTotal } from '@/components/cards/card-wallet'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getCCCategoryStats, getCCMonthlySummary } from '@/lib/db/cards'
import { accountHref } from '@/lib/accounts/routes'
import { categoryAnalysisHref } from '@/lib/accounts/category-links'
import { CategoryAnalysisLink } from '@/components/cards/category-analysis-link'
import {
  cardPeriodTotals,
  lastMonthWithData,
  plottedMonthCount,
  shareOf,
  sumCardMonthly,
} from '@/lib/insights/account-overview'
import { monthName } from '@/lib/utils/date'
import { CARD_COLORS } from '@/lib/nav/state'
import { seriesColor } from '@/lib/accounts/colors'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams { year?: string; month?: string }

// One color per card in the stacked chart (the nav's order); the first card keeps the dashboard's card color

/**
 * Every (non-archived) card: combined charges and a per-card breakdown. Card
 * charges are paid from the bank, so this page never adds bank spending.
 */
export default async function CardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }

  const accounts = await listAccounts({ kind: 'CREDIT_CARD' })
  const perCard = await Promise.all(
    accounts.map(async (account, i) => {
      const [monthly, stats] = await Promise.all([
        getCCMonthlySummary(account.id, Number(year)),
        getCCCategoryStats(account.id, Number(year), month),
      ])
      const total = Object.values(stats).reduce((s, v) => s + v.total, 0)
      const count = Object.values(stats).reduce((s, v) => s + v.count, 0)
      return { account, monthly, total, count, color: seriesColor(account.color, CARD_COLORS[i % CARD_COLORS.length]) }
    })
  )

  const combined = sumCardMonthly(perCard.map(c => c.monthly))
  const { average } = cardPeriodTotals(combined, month)
  const total = perCard.reduce((s, c) => s + c.total, 0)
  const count = perCard.reduce((s, c) => s + c.count, 0)
  const monthCount = plottedMonthCount(Number(year), lastMonthWithData(combined))
  const hasData = lastMonthWithData(combined) > 0
  const several = accounts.length > 1

  const heading = (
    <PageHeading period={{ year: Number(year), month }} title="כרטיסי אשראי">
      {hasData && <CategoryAnalysisLink href={categoryAnalysisHref(undefined, period)} />}
      <ManageAccountsLink />
    </PageHeading>
  )

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {heading}
        <EmptyState
          icon={CreditCard}
          title="אין כרטיסי אשראי"
          text="הוסף כרטיס או העלה פירוט חיובים כדי לראות כאן את החיובים לפי כרטיס."
          actions={[
            { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
            { href: '/settings#accounts', label: 'ניהול חשבונות' },
          ]}
        />
      </div>
    )
  }

  // The stack itself is the wallet in app/cards/layout.tsx; this page fills
  // the grid around it (components/cards/card-wallet.tsx, .wallet-shell)
  return (
    <div className="contents">
      <div className="wallet-shell__head">{heading}</div>
      {/* The total across the cards goes on the wallet's leather pocket (the count lives there too) */}
      <CardStackTotal value={total} />

      {/* Each card's figures, beside the stack: as tall as the stack on wide screens */}
      <ul className="wallet-shell__beside self-start divide-y overflow-hidden rounded-xl surface lg:flex lg:flex-col lg:self-stretch">
        {perCard.map(c => (
          <CardSummaryRow
            key={c.account.id}
            href={accountHref('CREDIT_CARD', c.account.id, period)}
            name={c.account.displayName}
            provider={c.account.provider}
            network={c.account.cardNetwork}
            lastFour={c.account.cardLastFour}
            total={c.total}
            count={c.count}
            color={c.color}
            colorChoice={c.account.color}
            share={several ? shareOf(c.total, total) : undefined}
          />
        ))}
      </ul>

      <div className="wallet-shell__rest space-y-6">
        {hasData ? (
          <>
            <CardSummaryCards
              total={total}
              count={count}
              average={average}
              monthLabel={month ? monthName(month) : undefined}
              label={several ? 'סה״כ חיובים בכל הכרטיסים' : undefined}
            />
            <MonthlySpendingChart
              series={perCard.map(c => ({ key: c.account.id, label: c.account.displayName, color: c.color, data: c.monthly }))}
              selectedMonth={month}
              monthCount={monthCount}
              subtitle={several ? 'כל הכרטיסים, לפי כרטיס · לחיצה על חודש מסננת' : undefined}
            />
          </>
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title={`אין חיובי כרטיס לשנת ${year}`}
            text="העלה פירוט חיובים מחברת האשראי כדי לראות כאן את החיובים החודשיים."
            actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
          />
        )}
      </div>
    </div>
  )
}
