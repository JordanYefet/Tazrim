import { cookies } from 'next/headers'
import { ScrollHintList } from '@/components/ui/scroll-hint-list'
import { CreditCard, FileSpreadsheet, Upload } from 'lucide-react'
import { columnsCookie, parseColumns } from '@/lib/tables/columns'
import { cn } from '@/lib/utils/cn'
import { CardStatTiles } from '@/components/cards/card-summary-cards'
import { MonthlySpendingChart } from '@/components/cards/monthly-spending-chart'
import { CardSummaryRow } from '@/components/accounts/account-cards'
import { CardStackTotal } from '@/components/cards/card-wallet'
import { WalletViews } from '@/components/cards/wallet-views'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getCCCategoryMonthly, getCCCategoryStats, getCCMonthlySummary, getCCTransactions } from '@/lib/db/cards'
import { getCategories } from '@/lib/db/categories'
import { asJson } from '@/lib/db/summary'
import { getUnusualFlagMap } from '@/lib/db/unusual'
import { getRecurringSeries } from '@/lib/db/recurring'
import { recurringNameMap } from '@/lib/insights/recurring-overrides'
import { CategoryDonut } from '@/components/cards/category-donut'
import { CardTransactionsTable } from '@/components/cards/card-transactions-table'
import { DataSwap } from '@/components/ui/data-swap'
import type { TableAccount } from '@/components/accounts/account-tag'
import { rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { accountHref } from '@/lib/accounts/routes'
import { categoryAnalysisHref } from '@/lib/accounts/category-links'
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

interface SearchParams {
  year?: string
  month?: string
  // The table's filters, as on a card's page (they narrow the table; the donut marks the category)
  search?: string
  merchant?: string
  category?: string
  showIgnored?: string
}

type CategoryStats = Awaited<ReturnType<typeof getCCCategoryStats>>
type CategoryMonthly = Awaited<ReturnType<typeof getCCCategoryMonthly>>

/** Every listed card's charges for the table: the same query and flags as a card's page (app/cards/[accountId]/page.tsx) */
async function getTableData(ids: string[], params: SearchParams & { year: string }) {
  const year = Number(params.year)
  const month = params.month ? Number(params.month) : undefined
  const [txs, categories, insights] = await Promise.all([
    // Same query as /api/cards/transactions?accountId=… (first page of 50 unless a month is selected)
    getCCTransactions({
      accountId: ids,
      year,
      month,
      search: params.search,
      merchant: params.merchant,
      category: params.category,
      showIgnored: params.showIgnored === 'true',
      take: month ? undefined : 50,
    }),
    getCategories('EXPENSE'),
    // Flags for the whole year, so rows loaded with "load more" get badges too
    getRecurringSeries().then(async r => ({
      flags: await getUnusualFlagMap({ since: `${year}-01-01`, until: `${year}-12-31`, recurring: { ids: r.transactionIds } }),
      recurring: recurringNameMap(r.series, ids),
    })),
  ])
  return {
    transactions: asJson(txs),
    categories: asJson(categories),
    unusual: insights.flags.card,
    recurring: insights.recurring,
  }
}

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
  const ids = accounts.map(a => a.id)
  // The per-card figures, the combined categories (for the donut: colours ranked by the
  // year, as on the analysis page) and the table below all read independently, so they run together
  const [perCard, [categoryStats, categoryMonthly], table] = await Promise.all([
    Promise.all(
      accounts.map(async (account, i) => {
        const [monthly, stats] = await Promise.all([
          getCCMonthlySummary(account.id, Number(year)),
          getCCCategoryStats(account.id, Number(year), month),
        ])
        const total = Object.values(stats).reduce((s, v) => s + v.total, 0)
        const count = Object.values(stats).reduce((s, v) => s + v.count, 0)
        return { account, monthly, total, count, color: seriesColor(account.color, CARD_COLORS[i % CARD_COLORS.length]) }
      })
    ),
    ids.length
      ? Promise.all([getCCCategoryStats(ids, Number(year), month), getCCCategoryMonthly(ids, Number(year))])
      : Promise.resolve<[CategoryStats, CategoryMonthly]>([{}, {}]),
    // The table below the charts: every card's charges (skipped with no cards)
    ids.length ? getTableData(ids, params) : null,
  ])

  const combined = sumCardMonthly(perCard.map(c => c.monthly))
  const { average } = cardPeriodTotals(combined, month)
  const total = perCard.reduce((s, c) => s + c.total, 0)
  const hasData = lastMonthWithData(combined) > 0
  const several = accounts.length > 1

  const heading = (
    <PageHeading period={{ year: Number(year), month }} title="כרטיסי אשראי">
      <ManageAccountsLink />
    </PageHeading>
  )

  if (accounts.length === 0 || !table) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {heading}
        {/* The heading is a div (PageHeading), so the entrance goes on the empty state's own wrapper */}
        <div className="page-in">
          <EmptyState
            icon={CreditCard}
            title="אין כרטיסי אשראי"
            text="הוסף כרטיס או העלה פירוט חיובים כדי לראות כאן את החיובים לפי כרטיס."
            actions={[
              { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
              { href: '/settings/accounts', label: 'ניהול חשבונות' },
            ]}
          />
        </div>
      </div>
    )
  }

  const tableAccounts: TableAccount[] = perCard.map(c => ({
    id: c.account.id,
    name: c.account.displayName,
    color: c.color,
    provider: c.account.provider,
  }))
  const categoryColors = categoryColorMap(rankCategories(categoryMonthly))
  const fetchSp = new URLSearchParams({ year })
  if (params.search) fetchSp.set('search', params.search)
  if (params.merchant) fetchSp.set('merchant', params.merchant)
  if (params.category) fetchSp.set('category', params.category)
  if (params.showIgnored) fetchSp.set('showIgnored', params.showIgnored)
  const hasMore = !month && table.transactions.length >= 50

  // The stack itself is the wallet in app/cards/layout.tsx; this page fills
  // the grid around it (components/cards/card-wallet.tsx, .wallet-shell)
  return (
    <div className="contents">
      <div className="wallet-shell__head">{heading}</div>
      {/* The total across the cards goes on the wallet's leather pocket (the count lives there too) */}
      <CardStackTotal value={total} />

      {/* Beside the stack, exactly as tall as it (never taller, so the page below keeps
          its place when a card opens): each card's figures, then the monthly
          average filling the rest. No monthly bars in them here: under the card list there
          is no room for them (a card's page, with the whole half, has them) */}
      {/* Phones: the transactions, or (מגמות) these figures and the charts */}
      <WalletViews enabled={hasData}>
      <div className={cn('wallet-shell__beside flex flex-col gap-4', hasData && 'wallet-shell__beside--fit')}>
      {/* Beside a wallet of fixed height: past a few accounts the list scrolls in its own card,
          and the figures under it keep their size (they never shrink under the list) */}
      <ScrollHintList className="min-h-0 shrink divide-y overflow-y-auto overscroll-contain rounded-xl surface">
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
      </ScrollHintList>
      {hasData && (
        <CardStatTiles
          className="shrink-0 grow"
          total={total}
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
                together) with the category analysis link; a category filters the table below */}
            <div data-view="trends" className="grid gap-4 lg:grid-cols-2">
              <MonthlySpendingChart
                series={perCard.map(c => ({ key: c.account.id, label: c.account.displayName, color: c.color, data: c.monthly }))}
                selectedMonth={month}
                subtitle={several ? 'כל הכרטיסים, לפי כרטיס · לחיצה על חודש מסננת' : undefined}
              />
              <CategoryDonut
                pagePath="/cards"
                data={Object.fromEntries(Object.entries(categoryStats).map(([k, v]) => [k, v.total]))}
                selectedCategory={params.category}
                colors={categoryColors}
                analysisHref={categoryAnalysisHref(undefined, period)}
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

        {/* Every card's charges together, as on a card's page */}
        {(hasData || table.transactions.length > 0 || params.showIgnored === 'true' || params.merchant || params.search || params.category) && (
          // Stays mounted while the keyed table remounts, so the new rows ease in
          <div data-view="list">
          <DataSwap swapKey={[params.merchant, params.search, params.month, params.year, params.category, params.showIgnored].join('|')} height>
            <CardTransactionsTable
              key={[params.merchant, params.search, params.month, params.year, params.category, params.showIgnored].join('|')}
              accounts={tableAccounts}
              transactions={table.transactions}
              categories={table.categories}
              categoryColors={categoryColors}
              activeCategory={params.category}
              showIgnored={params.showIgnored === 'true'}
              hasMore={hasMore}
              fetchParams={hasMore ? fetchSp.toString() : undefined}
              unusual={table.unusual}
              recurring={table.recurring}
              initialColumns={parseColumns((await cookies()).get(columnsCookie('card'))?.value, 'card')}
            />
          </DataSwap>
          </div>
        )}
      </div>
      </WalletViews>
    </div>
  )
}
