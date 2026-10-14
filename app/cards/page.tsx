import { CreditCard, FileSpreadsheet, Upload } from 'lucide-react'
import { CardSummaryCards } from '@/components/cards/card-summary-cards'
import { MonthlySpendingChart } from '@/components/cards/monthly-spending-chart'
import { CardAccountCard } from '@/components/accounts/account-cards'
import { EmptyState, ManageAccountsLink, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getCCCategoryMonthly, getCCCategoryStats, getCCMonthlySummary } from '@/lib/db/cards'
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
import { rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { monthName, periodLabel } from '@/lib/utils/date'

interface SearchParams { year?: string; month?: string }

// One color per card in the stacked chart; the first card keeps the dashboard's card color
const CARD_COLORS = ['var(--chart-cc)', 'var(--chart-1)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-8)', 'var(--chart-9)']
const TOP_CATEGORIES = 3

/**
 * Every (non-archived) card: combined charges and a per-card breakdown. Card
 * charges are paid from the bank, so this page never adds bank spending.
 */
export default async function CardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }

  const accounts = await listAccounts({ kind: 'CREDIT_CARD' })
  const ids = accounts.map(a => a.id)
  const [perCard, categoryMonthly] = await Promise.all([
    Promise.all(
      accounts.map(async (account, i) => {
        const [monthly, stats] = await Promise.all([
          getCCMonthlySummary(account.id, Number(year)),
          getCCCategoryStats(account.id, Number(year), month),
        ])
        const total = Object.values(stats).reduce((s, v) => s + v.total, 0)
        const count = Object.values(stats).reduce((s, v) => s + v.count, 0)
        return { account, monthly, stats, total, count, color: CARD_COLORS[i % CARD_COLORS.length] }
      })
    ),
    // ranks categories the same way as the card pages, so the colors match
    ids.length ? getCCCategoryMonthly(ids, Number(year)) : Promise.resolve({}),
  ])

  const combined = sumCardMonthly(perCard.map(c => c.monthly))
  const { average } = cardPeriodTotals(combined, month)
  const total = perCard.reduce((s, c) => s + c.total, 0)
  const count = perCard.reduce((s, c) => s + c.count, 0)
  const monthCount = plottedMonthCount(Number(year), lastMonthWithData(combined))
  const hasData = lastMonthWithData(combined) > 0
  const several = accounts.length > 1
  const colors = categoryColorMap(rankCategories(categoryMonthly))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading period={periodLabel(year, month)} title="כרטיסי אשראי">
        {hasData && <CategoryAnalysisLink href={categoryAnalysisHref(undefined, period)} />}
        <ManageAccountsLink />
      </PageHeading>

      {accounts.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="אין כרטיסי אשראי"
          text="הוסף כרטיס או העלה פירוט חיובים כדי לראות כאן את החיובים לפי כרטיס."
          actions={[
            { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
            { href: '/accounts', label: 'ניהול חשבונות' },
          ]}
        />
      ) : (
        <>
          {hasData ? (
            <>
              <CardSummaryCards
                total={total}
                count={count}
                average={average}
                monthLabel={month ? monthName(month) : undefined}
                label={several ? 'סה״כ חיובים בכל הכרטיסים' : undefined}
                extra={several ? [{ label: 'כרטיסים', value: accounts.length, tone: 'neutral', format: 'integer' }] : []}
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

          <section aria-labelledby="card-accounts" className="space-y-3">
            <h2 id="card-accounts" className="text-base font-semibold">
              {several ? `הכרטיסים (${accounts.length})` : 'הכרטיס'}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perCard.map(c => (
                <CardAccountCard
                  key={c.account.id}
                  href={accountHref('CREDIT_CARD', c.account.id, period)}
                  name={c.account.displayName}
                  lastFour={c.account.cardLastFour}
                  total={c.total}
                  count={c.count}
                  color={c.color}
                  share={several ? shareOf(c.total, total) : undefined}
                  topCategories={Object.entries(c.stats)
                    .map(([name, v]) => ({ name, total: v.total, color: colors[name] }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, TOP_CATEGORIES)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
