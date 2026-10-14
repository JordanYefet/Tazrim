import { CreditCard, Upload } from 'lucide-react'
import { CategoryAnalysis } from '@/components/cards/category-analysis'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { accountHref } from '@/lib/accounts/routes'
import { categoryAnalysisHref } from '@/lib/accounts/category-links'
import { periodLabel } from '@/lib/utils/date'

interface SearchParams { year?: string; month?: string }

/**
 * Every active card's spending by category, together. This static segment
 * wins over /cards/[accountId], so "categories" never reaches it as an id.
 */
export default async function AllCardsCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }

  const accounts = await listAccounts({ kind: 'CREDIT_CARD' })
  const ids = accounts.map(a => a.id)
  const monthly = ids.length ? await getCCCategoryMonthly(ids, Number(year)) : {}

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={periodLabel(year, month)}
        title={accounts.length > 1 ? `ניתוח לפי קטגוריה · ${accounts.length} כרטיסים` : 'ניתוח לפי קטגוריה'}
        back={{ href: accountHref('CREDIT_CARD', undefined, period), label: 'כרטיסי אשראי' }}
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="אין כרטיסי אשראי"
          text="הוסף כרטיס או העלה פירוט חיובים כדי לראות כאן את החיובים לפי קטגוריה."
          actions={[
            { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
            { href: '/accounts', label: 'ניהול חשבונות' },
          ]}
        />
      ) : (
        <CategoryAnalysis
          cardIds={ids}
          monthly={monthly}
          year={year}
          month={month}
          basePath={categoryAnalysisHref(undefined)}
          emptyText="העלה פירוט חיובים מחברת האשראי כדי לראות כאן את החיובים לפי קטגוריה וחודש."
        />
      )}
    </div>
  )
}
