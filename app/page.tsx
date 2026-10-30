import { DashboardSummaryCards } from '@/components/dashboard/summary-cards'
import { CombinedChart } from '@/components/dashboard/combined-chart'
import { CCMonthlyChart } from '@/components/dashboard/cc-monthly-chart'
import Link from 'next/link'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { monthName } from '@/lib/utils/date'
import { CategoryInsights } from '@/components/dashboard/category-insights'
import { getCCCategoryMonthly, getCCCategoryStats } from '@/lib/db/cards'
import { getBankCategoryMonthly, getBankCategoryStats } from '@/lib/db/bank-categories'
import { mergeCategoryMonthly, mergeCategoryStats, UNCATEGORIZED } from '@/lib/insights/bank-categories'
import { countUncategorized } from '@/lib/db/uncategorized'
import { CategoryDonut } from '@/components/cards/category-donut'
import { UncategorizedCard } from '@/components/dashboard/uncategorized-card'
import {
  insightsScopeOptions,
  resolveInsightsScope,
  scopeAccounts,
  scopeParam,
  type InsightsScope,
} from '@/lib/insights/insights-scope'
import {
  bankCategoryTransactionsHref,
  categoryTransactionsHref,
  combinedCategoryTransactionsHref,
  uncategorizedSearchHref,
} from '@/lib/accounts/category-links'
import { asJson, getYearSummary } from '@/lib/db/summary'
import { bankMonthTotal, cardBreakdown, cardLabel, monthTotal } from '@/lib/utils/year-summary'
import { computeCategoryInsights, latestMonthWithData, rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { RecurringCard } from '@/components/dashboard/recurring-card'
import { getRecurringSeries } from '@/lib/db/recurring'
import { UnusualCard } from '@/components/dashboard/unusual-card'
import { getUnusualTransactions, latestTransactionDate, unusualRange } from '@/lib/db/unusual'
import { MissingStatementsNotice } from '@/components/dashboard/missing-statements-notice'
import { monthHasData, monthlyAverage } from '@/lib/insights/account-overview'
import { DataDeletedNotice } from '@/components/dashboard/data-deleted-notice'
import { withResolvedPeriod } from '@/lib/period-server'
import { PeriodSync } from '@/components/layout/period-context'

interface SearchParams { year?: string; month?: string; card?: string; deleted?: string }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined

  // Every total covers the active (non-archived) accounts; archived ones keep their data
  const summary = await getYearSummary(Number(year))
  const activeCards = summary.accounts.cards
  const activeBanks = summary.accounts.bank
  const activeIds = [...activeBanks, ...activeCards]
  // Category insights: bank and cards together, or ?card=bank|cards|<card id> (lib/insights/insights-scope)
  const sources = { bankIds: activeBanks, cardIds: activeCards }
  const scope = resolveInsightsScope(params.card, sources)

  const [allCategoryMonthly, recurring, latest, cardStats, bankStats, uncategorized] = await Promise.all([
    // Every source, as one year: the colors follow its ranking, so they don't shift when filtering
    scopedCategoryMonthly({ kind: 'all' }, sources, Number(year)),
    // as of the latest statements, not the selected period
    getRecurringSeries({ accountId: activeIds }),
    latestTransactionDate(),
    // The combined donut: the period's card charges and bank debits by category
    activeCards.length ? getCCCategoryStats(activeCards, Number(year), month) : {},
    activeBanks.length ? getBankCategoryStats(activeBanks, Number(year), month, 'OUT') : {},
    countUncategorized(activeIds),
  ])
  // Bank and cards share the categories, so one donut holds both; the card payment is left out inside
  const donutStats = mergeCategoryStats(cardStats, bankStats)
  // A slice opens its transactions in search; "ללא קטגוריה" opens the uncategorized ones
  const donutHrefs: Record<string, string> = {}
  for (const c of Object.keys(donutStats)) {
    const href =
      c === UNCATEGORIZED
        ? uncategorizedSearchHref({ accountIds: activeIds, year, month })
        : combinedCategoryTransactionsHref({ accountIds: activeIds, category: c, year, month })
    if (href) donutHrefs[c] = href
  }
  const categoryMonthly =
    scope.kind === 'all' ? allCategoryMonthly : await scopedCategoryMonthly(scope, sources, Number(year))

  // Unusual transactions: the selected month, a past year, or the 90 days up to
  // the latest upload. Bank and card rows from every active account; the bank's card
  // payment is excluded inside (card rows are its breakdown, not extra spend).
  const today = new Date()
  const unusualAnchor = latest && latest < today ? latest : today
  const range = unusualRange({ year: Number(year), month, now: unusualAnchor })
  // A recurring charge's normal amount is never unusual (duplicates still are)
  const unusual = asJson(
    await getUnusualTransactions({ ...range, accountId: activeIds, recurring: { ids: recurring.transactionIds } })
  )
  const unusualSubtitle = month
    ? `תנועות חריגות ב${monthName(month)} ${year}`
    : Number(year) !== unusualAnchor.getFullYear()
      ? `תנועות חריגות בשנת ${year}`
      : 'תנועות חריגות ב־90 הימים האחרונים'
  const { bank, cards } = summary

  // Compare the selected month (or the latest month with card data) to earlier months
  const insightMonth = month ?? latestMonthWithData(categoryMonthly)
  const insights = insightMonth ? computeCategoryInsights(categoryMonthly, insightMonth) : null
  const categoryColors = categoryColorMap(rankCategories(allCategoryMonthly))
  const insightHrefs = insights
    ? Object.fromEntries(
        insights.items.map(i => [i.category, scopedCategoryHref(scope, sources, i.category, year, insights.month)])
      )
    : {}

  const { income: bankIncome, expense: bankExpense } = bankMonthTotal(bank, month)
  const ccTotal = monthTotal(cards, month)

  // Per-card split, shown only when there is more than one active card
  const multiCard = activeCards.length > 1
  const accountName = (id: string) => summary.byAccount[id].displayName
  const cardSeries = multiCard
    ? activeCards.map(id => {
        const a = summary.byAccount[id]
        return { label: cardLabel(a), monthly: a.kind === 'CREDIT_CARD' ? a.monthly : {} }
      })
    : undefined
  // "מקס" with the one card (as before), a generic name with several
  const cardsName = multiCard ? 'כרטיס' : activeCards.length === 1 ? accountName(activeCards[0]) : 'מקס'
  const banks = summary.accounts.bank
  const bankHint = banks.length === 1 ? accountName(banks[0]) : banks.length > 1 ? `${banks.length} חשבונות` : 'בנק'
  const cardHint = multiCard ? `${activeCards.length} כרטיסים` : cardsName
  const cardSplit = multiCard ? cardBreakdown(summary, month).map(c => ({ label: cardLabel(c), value: c.total })) : undefined
  const scopeOptions = insightsScopeOptions({
    hasBank: activeBanks.length > 0,
    cards: activeCards.map(id => ({ id, label: cardLabel(summary.byAccount[id]) })),
  })

  // Bank expenses already include the monthly card payment, so card charges
  // are a breakdown of that money — never add them on top.
  // Always the yearly average, so a selected month can be compared with it
  const averageExpense = monthlyAverage(Object.fromEntries(Object.entries(bank).map(([m, v]) => [m, v.expense])))

  const hasData =
    Object.values(bank).some(m => m.income > 0 || m.expense > 0) ||
    Object.values(cards).some(v => v > 0)

  const query = new URLSearchParams({ year, ...(month ? { month: String(month) } : {}) }).toString()

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Remembers the period across the app (ENG-63) */}
      <PeriodSync year={Number(year)} month={month} />
      {/* The header's pickers show the period; the title doesn't repeat it (ENG-64) */}
      <h1 className="text-2xl font-semibold tracking-tight">סקירה כללית</h1>

      <DataDeletedNotice show={params.deleted === '1'} />

      <MissingStatementsNotice />

      {hasData ? (
        <>
          <DashboardSummaryCards
            bankIncome={bankIncome}
            bankExpense={bankExpense}
            ccTotal={ccTotal}
            averageExpense={averageExpense}
            monthLabel={month ? monthName(month) : undefined}
            monthHasData={!!month && (monthHasData(bank, month) || monthHasData(cards, month))}
            query={query}
            bankHint={bankHint}
            cardHint={cardHint}
            cardSplit={cardSplit}
          />
          <CombinedChart
            bankSummary={bank}
            maxSummary={cards}
            cardsName={cardsName}
            selectedMonth={month}
          />
          {/* Two equal halves in every row, as on /banks and /cards, so the edges line up */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CCMonthlyChart data={cards} series={cardSeries} selectedMonth={month} />
            <CategoryInsights
              insights={insights}
              month={insightMonth}
              colors={categoryColors}
              options={scopeOptions}
              selected={scopeParam(scope)}
              query={query}
              hrefs={insightHrefs}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryDonut
              pagePath="/"
              title="הוצאות לפי קטגוריה · בנק וכרטיסים"
              data={Object.fromEntries(Object.entries(donutStats).map(([k, v]) => [k, v.total]))}
              stats={donutStats}
              colors={categoryColors}
              categoryHrefs={donutHrefs}
            />
            <UncategorizedCard bank={uncategorized.bank} card={uncategorized.card} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RecurringCard series={recurring.subscriptions} total={recurring.total} />
            <UnusualCard key={`${range.since}|${range.until}`} items={unusual} subtitle={unusualSubtitle} />
          </div>
        </>
      ) : (
        <EmptyState year={year} />
      )}
    </div>
  )
}

function EmptyState({ year }: { year: string }) {
  return (
    <section className="rounded-xl surface border-dashed px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FileSpreadsheet className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">אין נתונים לשנת {year}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground text-pretty">
        העלה קובץ תנועות מבנק לאומי או פירוט חיובים ממקס כדי לראות כאן את התזרים החודשי.
      </p>
      <Link
        href="/upload"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-fast hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Upload className="h-4 w-4" aria-hidden />
        העלאת קבצים
      </Link>
    </section>
  )
}

type Sources = { bankIds: string[]; cardIds: string[] }

/**
 * category -> month spending of a scope: card charges by billing month, bank
 * debits by date. The bank's card payment is left out: the card charges are
 * its breakdown, so counting both would count that money twice.
 */
async function scopedCategoryMonthly(scope: InsightsScope, sources: Sources, year: number) {
  const { bankIds, cardIds } = scopeAccounts(scope, sources)
  const [cards, bank] = await Promise.all([
    cardIds.length ? getCCCategoryMonthly(cardIds, year) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, year, 'OUT', { cardPayments: 'exclude' }) : {},
  ])
  return mergeCategoryMonthly(cards, bank)
}

/** Where an insight's category opens its transactions in that month */
function scopedCategoryHref(scope: InsightsScope, sources: Sources, category: string, year: string, month: number) {
  const { bankIds, cardIds } = scopeAccounts(scope, sources)
  const period = { category, year, month }
  if (!bankIds.length) return categoryTransactionsHref({ cardIds, ...period })
  if (!cardIds.length) return bankCategoryTransactionsHref({ accountIds: bankIds, ...period })
  return combinedCategoryTransactionsHref({ accountIds: [...bankIds, ...cardIds], ...period })
}
