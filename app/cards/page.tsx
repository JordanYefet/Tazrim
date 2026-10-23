import { CreditCard, FileSpreadsheet, Upload } from 'lucide-react'
import { CardStatTiles } from '@/components/cards/card-summary-cards'
import { MonthlySpendingChart } from '@/components/cards/monthly-spending-chart'
import { CardSummaryRow } from '@/components/accounts/account-cards'
import { CardStackTotal } from '@/components/cards/card-wallet'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getCCCategoryMonthly, getCCCategoryStats, getCCMonthlySummary } from '@/lib/db/cards'
import { CategoryDonut } from '@/components/cards/category-donut'
import { rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { accountHref } from '@/lib/accounts/routes'
import { categoryAnalysisHref, categoryTransactionsHref } from '@/lib/accounts/category-links'
import {
  cardPeriodTotals,
  lastMonthWithData,
  monthHasData,
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

  // Every card's categories together, for the donut (colours ranked by the year, as on the analysis page)
  const ids = accounts.map(a => a.id)
  const [categoryStats, categoryMonthly] = ids.length
    ? await Promise.all([getCCCategoryStats(ids, Number(year), month), getCCCategoryMonthly(ids, Number(year))])
    : [{}, {}]

  const combined = sumCardMonthly(perCard.map(c => c.monthly))
  const { average } = cardPeriodTotals(combined, month)
  const total = perCard.reduce((s, c) => s + c.total, 0)
  const count = perCard.reduce((s, c) => s + c.count, 0)
  const hasData = lastMonthWithData(combined) > 0
  const several = accounts.length > 1

  const heading = (
    <PageHeading period={{ year: Number(year), month }} title="כרטיסי אשראי">
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

      {/* Beside the stack, as tall as it: each card's figures, then the count and the
          monthly average stretched to fill (the same two tiles as on a card's page) */}
      <div className="wallet-shell__beside flex flex-col gap-4">
      <ul className="divide-y overflow-hidden rounded-xl surface">
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
      {hasData && (
        <CardStatTiles
          className="flex-1"
          total={total}
          count={count}
          average={average}
          monthLabel={month ? monthName(month) : undefined}
          monthHasData={!!month && monthHasData(combined, month)}
        />
      )}
      </div>

      <div className="wallet-shell__rest space-y-6">
        {hasData ? (
          <>
            {/* The same pair as on a card's page: the months, and the categories (every card's
                together) with the category analysis link; a category opens its transactions */}
            <div className="grid gap-4 lg:grid-cols-2">
              <MonthlySpendingChart
                series={perCard.map(c => ({ key: c.account.id, label: c.account.displayName, color: c.color, data: c.monthly }))}
                selectedMonth={month}
                subtitle={several ? 'כל הכרטיסים, לפי כרטיס · לחיצה על חודש מסננת' : undefined}
              />
              <CategoryDonut
                pagePath="/cards"
                data={Object.fromEntries(Object.entries(categoryStats).map(([k, v]) => [k, v.total]))}
                stats={categoryStats}
                colors={categoryColorMap(rankCategories(categoryMonthly))}
                analysisHref={categoryAnalysisHref(undefined, period)}
                categoryHrefs={Object.fromEntries(
                  Object.keys(categoryStats).map(c => [c, categoryTransactionsHref({ cardIds: ids, category: c, year, month })])
                )}
              />
            </div>
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
