import { CategoryAnalysis } from '@/components/cards/category-analysis'
import { bankCategoryTransactionsHref } from '@/lib/accounts/category-links'
import type { CategoryMonthly } from '@/lib/insights/category-insights'

/**
 * Bank rows by category over the year: expenses (the card payment as its own
 * bucket, its breakdown is on the card) and income, each with the stacked
 * chart and the category × month table.
 */
export function BankCategoryAnalysis({
  accountIds,
  expense,
  income,
  year,
  month,
  basePath,
  uploadHint,
}: {
  accountIds: string[]
  expense: CategoryMonthly
  income: CategoryMonthly
  year: string
  month?: number
  basePath: string
  /** "Upload <account>'s file…", for the empty states */
  uploadHint: string
}) {
  const href = (category: string) => bankCategoryTransactionsHref({ accountIds, category, year, month })
  return (
    <>
      <section aria-labelledby="bank-cat-expense" className="space-y-4">
        <h2 id="bank-cat-expense" className="text-base font-semibold">הוצאות</h2>
        <CategoryAnalysis
          monthly={expense}
          year={year}
          month={month}
          basePath={basePath}
          categoryHref={href}
          emptyTitle={`אין הוצאות לשנת ${year}`}
          emptyText={uploadHint}
          unit="תנועות"
        />
      </section>
      <section aria-labelledby="bank-cat-income" className="space-y-4">
        <h2 id="bank-cat-income" className="text-base font-semibold">הכנסות</h2>
        <CategoryAnalysis
          monthly={income}
          year={year}
          month={month}
          basePath={basePath}
          categoryHref={href}
          emptyTitle={`אין הכנסות לשנת ${year}`}
          emptyText={uploadHint}
          chartTitle="הכנסות לפי קטגוריה לאורך השנה"
          unit="תנועות"
        />
      </section>
    </>
  )
}
