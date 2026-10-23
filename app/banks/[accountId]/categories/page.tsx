import { notFound } from 'next/navigation'
import { PageHeading } from '@/components/accounts/page-parts'
import { BankCategoryAnalysis } from '@/components/bank/bank-category-analysis'
import { getAccount } from '@/lib/db/accounts'
import { getBankCategoryMonthly } from '@/lib/db/bank-categories'
import { accountHref } from '@/lib/accounts/routes'
import { bankCategoryAnalysisHref } from '@/lib/accounts/category-links'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams { year?: string; month?: string }

/** One bank account's expenses and income by category over the year. */
export default async function BankCategoriesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { accountId } = await routeParams
  const account = await getAccount(decodeURIComponent(accountId))
  if (!account || account.kind !== 'BANK') notFound()

  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }
  const [expense, income] = await Promise.all([
    getBankCategoryMonthly(account.id, Number(year), 'OUT'),
    getBankCategoryMonthly(account.id, Number(year), 'IN'),
  ])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={{ year: Number(year), month }}
        title="ניתוח לפי קטגוריה"
        back={{ href: accountHref('BANK', account.id, period), label: account.displayName }}
        badge={account.archived ? 'בארכיון' : undefined}
      />
      <BankCategoryAnalysis
        accountIds={[account.id]}
        expense={expense}
        income={income}
        year={year}
        month={month}
        basePath={bankCategoryAnalysisHref(account.id)}
        uploadHint={`העלה קובץ תנועות של ${account.displayName} כדי לראות כאן את התנועות לפי קטגוריה וחודש.`}
      />
    </div>
  )
}
