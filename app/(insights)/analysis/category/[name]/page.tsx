import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeading } from '@/components/accounts/page-parts'
import { AccountPills } from '@/components/accounts/account-pills'
import { RollingNumber } from '@/components/ui/rolling-number'
import { CategoryYearBars } from '@/components/insights/category-year-bars'
import { TopMerchants } from '@/components/insights/top-merchants'
import { CategoryMonthList } from '@/components/insights/category-month-list'
import { listAccounts } from '@/lib/db/accounts'
import { getCategories } from '@/lib/db/categories'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { getBankCategoryMonthly } from '@/lib/db/bank-categories'
import { getCategoryYearRows } from '@/lib/db/category-year'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { mergeCategoryMonthly } from '@/lib/insights/bank-categories'
import { latestMonthWithData, rankCategories, type CategoryMonthly } from '@/lib/insights/category-insights'
import { summarizeCategoryYear } from '@/lib/insights/category-year'
import { analysisScopeOptions, resolveAnalysisScope } from '@/lib/insights/analysis-scope'
import { currentMonth } from '@/lib/period'
import { analysisHref, categoryYearHref } from '@/lib/accounts/category-links'
import { categoryColorMap, OTHER_COLOR } from '@/lib/utils/category-colors'
import { monthName, periodLabel } from '@/lib/utils/date'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams { year?: string; month?: string; scope?: string }

const yearTotalOf = (monthly: CategoryMonthly) =>
  Object.values(monthly).reduce((s, byMonth) => s + Object.values(byMonth).reduce((a, v) => a + v, 0), 0)

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  return { title: `${decodeURIComponent(name)} · תזרים` }
}

/**
 * A category's year (the drill-down behind every category tap): one number, twelve
 * months, the merchants that made it and the selected month's rows, bank and cards
 * together. With cards in scope the bank's card payment is left out (the card charges
 * are its breakdown), as on the analysis page; `?scope=` narrows it the same way.
 */
export default async function CategoryYearPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}) {
  const { name } = await routeParams
  const category = decodeURIComponent(name)
  const params = await withResolvedPeriod(await searchParams)
  const year = Number(params.year)
  const month = params.month ? Number(params.month) : undefined

  const [bankAccounts, cardAccounts, categories, generic] = await Promise.all([
    listAccounts({ kind: 'BANK' }),
    listAccounts({ kind: 'CREDIT_CARD' }),
    getCategories(),
    listGenericDescriptions(),
  ])
  const banks = bankAccounts.map(a => ({ id: a.id, label: a.displayName }))
  const cards = cardAccounts.map(a => ({ id: a.id, label: a.displayName }))
  const scope = resolveAnalysisScope(params.scope, { banks, cards })
  const options = analysisScopeOptions({ banks, cards })
  const accountsById = new Map([...bankAccounts, ...cardAccounts].map(a => [a.id, a]))
  const { bankIds, cardIds } = scope
  // An issuer's own category (on card rows nobody mapped) is not in the list: it is spending
  const kind = categories.find(c => c.name === category)?.kind === 'INCOME' ? 'INCOME' : 'EXPENSE'

  const [cardMonthly, outMonthly, inMonthly, rows] = await Promise.all([
    cardIds.length ? getCCCategoryMonthly(cardIds, year) : {},
    // With cards in scope the bank's card payment is left out: the card charges are its breakdown
    bankIds.length ? getBankCategoryMonthly(bankIds, year, 'OUT', { cardPayments: cardIds.length ? 'exclude' : 'bucket' }) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, year, 'IN') : {},
    getCategoryYearRows({ bankIds, cardIds, year, category, kind }),
  ])
  const expenseMonthly = mergeCategoryMonthly(cardMonthly, outMonthly)
  const own = kind === 'INCOME' ? inMonthly : expenseMonthly
  // Colours as everywhere: ranked by the year's totals of the same sources
  const colors = { ...categoryColorMap(rankCategories(inMonthly)), ...categoryColorMap(rankCategories(expenseMonthly)) }
  const color = colors[category] ?? OTHER_COLOR

  const summary = summarizeCategoryYear(rows, {
    kind,
    year,
    month,
    yearTotal: yearTotalOf(own),
    lastDataMonth: latestMonthWithData(own),
  })
  const today = currentMonth()
  const thisYear = today.year === year
  const inProgressMonth = thisYear ? today.month : undefined
  const period = { year: String(year), ...(month ? { month: String(month) } : {}) }
  const scopeParam = scope.value || undefined
  const monthHref = (m: number | undefined) => categoryYearHref(category, { year, month: m, scope: scopeParam })
  const picker = {
    expense: categories.filter(c => c.kind === 'EXPENSE').map(c => c.name),
    income: categories.filter(c => c.kind === 'INCOME').map(c => c.name),
    colors,
    generic,
  }
  const whole = kind === 'INCOME' ? 'מההכנסות' : 'מההוצאות'
  const focusLabel = summary.focusMonth ? periodLabel(year, summary.focusMonth) : String(year)
  const pct = summary.share === null ? null : Math.round(summary.share * 100)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading period={{ year, month }} title={category} badge={kind === 'INCOME' ? 'הכנסה' : undefined}>
        <Link
          href={analysisHref(scopeParam, period)}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          כל הקטגוריות
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      </PageHeading>

      <div className="page-in space-y-6">
        {options.length > 0 && (
          <AccountPills
            label="סינון לפי חשבון"
            active={scope.value || 'all'}
            items={options.map(o => {
              const account = accountsById.get(o.value)
              return {
                key: o.value || 'all',
                label: o.label,
                href: categoryYearHref(category, { year, month, scope: o.value || undefined }),
                account: account && {
                  kind: account.kind as 'BANK' | 'CREDIT_CARD',
                  provider: account.provider,
                  network: account.cardNetwork,
                  color: account.color,
                },
              }
            })}
          />
        )}

        {/* The one hero: the year's figure (or, with a month picked, that month's), its context,
            and the twelve months under it. Picking a month rolls the number to the month's;
            the year's total moves into the line under it, which keeps its height */}
        <section className="rounded-xl surface-hero p-4 sm:p-6">
          <p className="text-sm font-medium text-muted-foreground">
            {month
              ? summary.focusMonth === month && summary.focusInProgress && thisYear
                ? `${monthName(month)} עד כה`
                : `ב${monthName(month)} ${year}`
              : thisYear
                ? 'השנה עד כה'
                : `בשנת ${year}`}
          </p>
          <RollingNumber
            value={month ? (summary.months[month] ?? 0) : summary.total}
            format="currency"
            className="mt-1 block text-4xl font-semibold tracking-tight tabular-nums sm:text-[2.75rem]"
          />
          <p className="mt-1 min-h-5 text-sm text-muted-foreground tabular-nums">
            {summary.total === 0 && rows.length === 0 ? (
              `אין תנועות בקטגוריה הזאת בשנת ${year}`
            ) : month ? (
              <>
                {thisYear ? 'השנה עד כה' : `בשנת ${year}`} <RollingNumber value={summary.total} format="currency" />
                {summary.average !== null && (
                  <>
                    {' · '}ממוצע <RollingNumber value={summary.average} format="currency" /> לחודש
                  </>
                )}
              </>
            ) : (
              <>
                {summary.average !== null && (
                  <>
                    ממוצע <RollingNumber value={summary.average} format="currency" /> לחודש
                  </>
                )}
                {summary.average !== null && pct !== null && ' · '}
                {pct !== null && (
                  <>
                    <RollingNumber value={pct} format="percent" /> {whole}
                  </>
                )}
              </>
            )}
          </p>
          <CategoryYearBars
            values={summary.months}
            selectedMonth={month}
            inProgressMonth={inProgressMonth}
            color={color}
            href={monthHref}
            className="mt-5"
          />
        </section>

        {/* Two equal halves: who the money went to, and the month's rows */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TopMerchants
            merchants={summary.merchants}
            year={year}
            title={kind === 'INCOME' ? 'המקורות הגדולים השנה' : 'העסקים הגדולים השנה'}
            emptyText={`אין תנועות בקטגוריה הזאת בשנת ${year}`}
          />
          <CategoryMonthList
            rows={summary.monthRows}
            title={summary.focusMonth ? `${thisYear && summary.focusInProgress ? 'החודש עד כה · ' : ''}${focusLabel}` : focusLabel}
            total={summary.focusMonth ? summary.months[summary.focusMonth] : 0}
            picker={picker}
            emptyText={
              summary.focusMonth
                ? `אין תנועות בקטגוריה הזאת ב${monthName(summary.focusMonth)} ${year}`
                : `אין תנועות בקטגוריה הזאת בשנת ${year}`
            }
          />
        </div>
      </div>
    </div>
  )
}
