import { DashboardSummaryCards } from '@/components/dashboard/summary-cards'
import { CombinedChart } from '@/components/dashboard/combined-chart'
import { CCMonthlyChart } from '@/components/dashboard/cc-monthly-chart'
import Link from 'next/link'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { monthName } from '@/lib/utils/date'
import { CategoryInsights } from '@/components/dashboard/category-insights'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { asJson, getYearSummary } from '@/lib/db/summary'
import { bankMonthTotal, cardBreakdown, cardLabel, monthTotal, resolveCardParam } from '@/lib/utils/year-summary'
import { computeCategoryInsights, latestMonthWithData, rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { RecurringCard } from '@/components/dashboard/recurring-card'
import { getRecurringSeries } from '@/lib/db/recurring'
import { UnusualCard } from '@/components/dashboard/unusual-card'
import { getUnusualTransactions, latestTransactionDate, unusualRange } from '@/lib/db/unusual'
import { MissingStatementsNotice } from '@/components/dashboard/missing-statements-notice'
import { getDefaultAccount, PROVIDERS } from '@/lib/db/accounts'
import { accountPath } from '@/lib/accounts/routes'
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
  // Optional ?card=<accountId> narrows the category insights to one card
  const cardFilter = resolveCardParam(params.card, activeCards)
  const activeIds = [...summary.accounts.bank, ...activeCards]

  const [categoryMonthly, allCardsCategoryMonthly, recurring, latest, defaultCard] = await Promise.all([
    getCCCategoryMonthly(cardFilter ?? activeCards, Number(year)),
    // Colors follow the all-cards ranking, so they don't shift when filtering
    cardFilter ? getCCCategoryMonthly(activeCards, Number(year)) : null,
    // as of the latest statements, not the selected period
    getRecurringSeries({ accountId: activeIds }),
    latestTransactionDate(),
    // fallback card page for the category-insight links
    getDefaultAccount('CREDIT_CARD', PROVIDERS.MAX),
  ])

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
  const categoryColors = categoryColorMap(rankCategories(allCardsCategoryMonthly ?? categoryMonthly))

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
  const cardOptions = multiCard ? activeCards.map(id => ({ id, label: cardLabel(summary.byAccount[id]) })) : []
  const insightsCardName = cardFilter ? cardLabel(summary.byAccount[cardFilter]) : cardsName

  // Bank expenses already include the monthly card payment, so card charges
  // are a breakdown of that money — never add them on top.
  // Always the yearly average, so a selected month can be compared with it
  const averageExpense = monthlyAverage(Object.fromEntries(Object.entries(bank).map(([m, v]) => [m, v.expense])))

  const hasData =
    Object.values(bank).some(m => m.income > 0 || m.expense > 0) ||
    Object.values(cards).some(v => v > 0)

  const query = new URLSearchParams({ year, ...(month ? { month: String(month) } : {}) }).toString()

  // Category-insight links open the filtered card, the only card, or the default MAX card
  const insightsCardId = cardFilter ?? (activeCards.length === 1 ? activeCards[0] : defaultCard?.id)

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
          {/* Every row shares the summary's 5/7 split, so the edges line up */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <CCMonthlyChart data={cards} series={cardSeries} selectedMonth={month} />
            <CategoryInsights
              insights={insights}
              month={insightMonth}
              year={year}
              colors={categoryColors}
              cardsName={insightsCardName}
              cardOptions={cardOptions}
              selectedCard={cardFilter}
              query={query}
              cardPath={accountPath('CREDIT_CARD', insightsCardId)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
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
