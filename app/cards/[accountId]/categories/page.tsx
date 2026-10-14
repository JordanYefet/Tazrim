import { notFound } from 'next/navigation'
import { CategoryAnalysis } from '@/components/cards/category-analysis'
import { PageHeading } from '@/components/accounts/page-parts'
import { getAccount } from '@/lib/db/accounts'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { accountHref } from '@/lib/accounts/routes'
import { categoryAnalysisHref } from '@/lib/accounts/category-links'
import { periodLabel } from '@/lib/utils/date'

interface SearchParams { year?: string; month?: string }

/** One card's spending by category over the year: the stacked chart and the category × month table. */
export default async function CardCategoriesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { accountId } = await routeParams
  const account = await getAccount(decodeURIComponent(accountId))
  if (!account || account.kind !== 'CREDIT_CARD') notFound()

  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }
  const monthly = await getCCCategoryMonthly(account.id, Number(year))
  const name = account.cardLastFour ? `${account.displayName} ·${account.cardLastFour}` : account.displayName

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={periodLabel(year, month)}
        title="ניתוח לפי קטגוריה"
        back={{ href: accountHref('CREDIT_CARD', account.id, period), label: name }}
        badge={account.archived ? 'בארכיון' : undefined}
      />
      <CategoryAnalysis
        cardIds={[account.id]}
        monthly={monthly}
        year={year}
        month={month}
        basePath={categoryAnalysisHref(account.id)}
        emptyText={`העלה פירוט חיובים של ${account.displayName} כדי לראות כאן את החיובים לפי קטגוריה וחודש.`}
      />
    </div>
  )
}
