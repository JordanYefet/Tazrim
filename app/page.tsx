import { DashboardSummaryCards } from '@/components/dashboard/summary-cards'
import { CombinedChart } from '@/components/dashboard/combined-chart'
import { CCMonthlyChart } from '@/components/dashboard/cc-monthly-chart'
import Link from 'next/link'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { monthName } from '@/lib/utils/date'
import { CategoryInsights } from '@/components/dashboard/category-insights'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { asJson, getYearSummary } from '@/lib/db/summary'
import { computeCategoryInsights, latestMonthWithData, rankCategories } from '@/lib/insights/category-insights'
import { categoryColorMap } from '@/lib/utils/category-colors'

interface SearchParams { year?: string; month?: string }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined

  const [summary, categoryMonthly] = await Promise.all([
    getYearSummary(Number(year)),
    getCCCategoryMonthly('MAX', Number(year)),
  ])
  const { bank, max } = asJson(summary)

  // Compare the selected month (or the latest month with card data) to earlier months
  const insightMonth = month ?? latestMonthWithData(categoryMonthly)
  const insights = insightMonth ? computeCategoryInsights(categoryMonthly, insightMonth) : null
  const categoryColors = categoryColorMap(rankCategories(categoryMonthly))

  const bankData = bank as Record<string, { income: number; expense: number }>
  const maxData = max as Record<string, number>

  const bankIncome = month
    ? (bankData[String(month)]?.income ?? 0)
    : Object.values(bankData).reduce((s, m) => s + m.income, 0)
  const bankExpense = month
    ? (bankData[String(month)]?.expense ?? 0)
    : Object.values(bankData).reduce((s, m) => s + m.expense, 0)
  const ccTotal = month
    ? (maxData[String(month)] ?? 0)
    : Object.values(maxData).reduce((s, v) => s + v, 0)

  // Bank expenses already include the monthly card payment, so card charges
  // are a breakdown of that money — never add them on top.
  const averageExpense = !month
    ? bankExpense / Math.max(Object.values(bankData).filter(m => m.expense > 0).length, 1)
    : undefined

  const hasData =
    Object.values(bankData).some(m => m.income > 0 || m.expense > 0) ||
    Object.values(maxData).some(v => v > 0)

  // Don't plot months that haven't happened yet; past years show all 12
  const now = new Date()
  const lastDataMonth = Math.max(
    0,
    ...Object.entries(bankData).filter(([, m]) => m.income > 0 || m.expense > 0).map(([k]) => Number(k)),
    ...Object.entries(maxData).filter(([, v]) => v > 0).map(([k]) => Number(k))
  )
  const monthCount =
    Number(year) < now.getFullYear()
      ? 12
      : Math.max(Number(year) === now.getFullYear() ? now.getMonth() + 1 : 1, lastDataMonth)

  const query = new URLSearchParams({ year, ...(month ? { month: String(month) } : {}) }).toString()
  const periodLabel = month ? `${monthName(month)} ${year}` : `כל החודשים · ${year}`

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{periodLabel}</p>
        <h1 className="text-2xl font-semibold tracking-tight">סקירה כללית</h1>
      </div>

      {hasData ? (
        <>
          <DashboardSummaryCards
            bankIncome={bankIncome}
            bankExpense={bankExpense}
            ccTotal={ccTotal}
            averageExpense={averageExpense}
            query={query}
          />
          <CombinedChart bankSummary={bank} maxSummary={max} monthCount={monthCount} selectedMonth={month} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <CCMonthlyChart data={max} monthCount={monthCount} selectedMonth={month} />
            <CategoryInsights insights={insights} month={insightMonth} year={year} colors={categoryColors} />
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
    <section className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FileSpreadsheet className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">אין נתונים לשנת {year}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground text-pretty">
        העלה קובץ תנועות מבנק לאומי או פירוט חיובים ממקס כדי לראות כאן את התזרים החודשי.
      </p>
      <Link
        href="/upload"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Upload className="h-4 w-4" aria-hidden />
        העלאת קבצים
      </Link>
    </section>
  )
}
