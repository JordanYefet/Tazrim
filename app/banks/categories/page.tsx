import { Building2, Upload } from 'lucide-react'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { BankCategoryAnalysis } from '@/components/bank/bank-category-analysis'
import { listAccounts } from '@/lib/db/accounts'
import { getBankCategoryMonthly } from '@/lib/db/bank-categories'
import { accountHref } from '@/lib/accounts/routes'
import { bankCategoryAnalysisHref } from '@/lib/accounts/category-links'
import { withResolvedPeriod } from '@/lib/period-server'

interface SearchParams { year?: string; month?: string }

/**
 * Every active bank account's expenses and income by category, together. This
 * static segment wins over /banks/[accountId], so "categories" never reaches it as an id.
 */
export default async function AllBanksCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined
  const period = { year, ...(month ? { month: String(month) } : {}) }

  const accounts = await listAccounts({ kind: 'BANK' })
  const ids = accounts.map(a => a.id)
  const [expense, income] = ids.length
    ? await Promise.all([
        getBankCategoryMonthly(ids, Number(year), 'OUT'),
        getBankCategoryMonthly(ids, Number(year), 'IN'),
      ])
    : [{}, {}]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        period={{ year: Number(year), month }}
        title={accounts.length > 1 ? `ניתוח לפי קטגוריה · ${accounts.length} חשבונות` : 'ניתוח לפי קטגוריה'}
        back={{ href: accountHref('BANK', undefined, period), label: 'בנקים' }}
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="אין חשבונות בנק"
          text="הוסף חשבון בנק או העלה קובץ תנועות כדי לראות כאן את התנועות לפי קטגוריה."
          actions={[
            { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
            { href: '/settings#accounts', label: 'ניהול חשבונות' },
          ]}
        />
      ) : (
        <BankCategoryAnalysis
          accountIds={ids}
          expense={expense}
          income={income}
          year={year}
          month={month}
          basePath={bankCategoryAnalysisHref(undefined)}
          uploadHint="העלה קובץ תנועות מהבנק כדי לראות כאן את התנועות לפי קטגוריה וחודש."
        />
      )}
    </div>
  )
}
