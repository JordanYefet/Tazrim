import { PieChart, Upload } from 'lucide-react'
import { CategoryAnalysis } from '@/components/cards/category-analysis'
import { EmptyState, PageHeading } from '@/components/accounts/page-parts'
import { listAccounts } from '@/lib/db/accounts'
import { getCCCategoryMonthly } from '@/lib/db/cards'
import { getBankCategoryMonthly } from '@/lib/db/bank-categories'
import { mergeCategoryMonthly, UNCATEGORIZED, CARD_PAYMENT_CATEGORY } from '@/lib/insights/bank-categories'
import { analysisScopeOptions, resolveAnalysisScope, type AnalysisScope } from '@/lib/insights/analysis-scope'
import {
  analysisHref,
  bankCategoryTransactionsHref,
  categoryTransactionsHref,
  categoryYearHref,
  uncategorizedSearchHref,
} from '@/lib/accounts/category-links'
import { withResolvedPeriod } from '@/lib/period-server'
import { AccountPills } from '@/components/accounts/account-pills'

interface SearchParams { year?: string; month?: string }

/**
 * Where a category of the analysis opens: its year (/analysis/category/<name>) in the
 * same scope. "ללא קטגוריה" is not a category: it opens the rows without one, on the
 * account's page when it is one account, else in search. The card payment opens nothing.
 */
function transactionsHref(scope: AnalysisScope, category: string, year: string, month?: number): string | undefined {
  const { bankIds, cardIds } = scope
  if (category === CARD_PAYMENT_CATEGORY) return undefined
  if (category !== UNCATEGORIZED) return categoryYearHref(category, { year, month, scope: scope.value || undefined })
  if (!bankIds.length) return categoryTransactionsHref({ cardIds, category, year, month })
  if (!cardIds.length) return bankCategoryTransactionsHref({ accountIds: bankIds, category, year, month })
  return uncategorizedSearchHref({ accountIds: [...bankIds, ...cardIds], year, month })
}

/**
 * Spending and income by category over the year, bank and cards together (they share
 * the categories), narrowed by the chips to the bank, the cards or one account. Replaces
 * the four pages per kind and account (/cards/categories, /banks/<id>/categories, …),
 * which redirect here.
 */
export default async function AnalysisPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ scope?: string[] }>
  searchParams: Promise<SearchParams>
}) {
  const { scope: segments } = await routeParams
  const params = await withResolvedPeriod(await searchParams)
  const year = params.year
  const month = params.month ? Number(params.month) : undefined

  const [bankAccounts, cardAccounts] = await Promise.all([listAccounts({ kind: 'BANK' }), listAccounts({ kind: 'CREDIT_CARD' })])
  const banks = bankAccounts.map(a => ({ id: a.id, label: a.displayName }))
  const cards = cardAccounts.map(a => ({ id: a.id, label: a.displayName }))
  const scope = resolveAnalysisScope(segments?.[0] ? decodeURIComponent(segments[0]) : undefined, { banks, cards })
  const options = analysisScopeOptions({ banks, cards })
  // An account's chip shows its face, as in the account switcher
  const accountsById = new Map([...bankAccounts, ...cardAccounts].map(a => [a.id, a]))
  const { bankIds, cardIds } = scope

  const [cardMonthly, outMonthly, inMonthly] = await Promise.all([
    cardIds.length ? getCCCategoryMonthly(cardIds, Number(year)) : {},
    // With cards in scope the bank's card payment is left out: the card charges are its breakdown
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'OUT', { cardPayments: cardIds.length ? 'exclude' : 'bucket' }) : {},
    bankIds.length ? getBankCategoryMonthly(bankIds, Number(year), 'IN') : {},
  ])
  const expense = mergeCategoryMonthly(cardMonthly, outMonthly)
  const basePath = analysisHref(scope.value || undefined)
  const period = { year, ...(month ? { month: String(month) } : {}) }
  const href = (category: string) => transactionsHref(scope, category, year, month)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading period={{ year: Number(year), month }} title="ניתוח לפי קטגוריה" />

      {/* The heading is a div (PageHeading), so the entrance goes on the content's own wrapper;
          a chip remounts the page (the scope is a route segment) and replays it, a month doesn't */}
      <div className="page-in space-y-6">
        {banks.length + cards.length === 0 ? (
          <EmptyState
            icon={PieChart}
            title="אין חשבונות"
            text="הוסף חשבון בנק או כרטיס אשראי והעלה קבצים כדי לראות כאן את ההוצאות וההכנסות לפי קטגוריה."
            actions={[
              { href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true },
              { href: '/settings/accounts', label: 'ניהול חשבונות' },
            ]}
          />
        ) : (
          <>
            {options.length > 0 && (
              <AccountPills
                label="סינון לפי חשבון"
                active={scope.value || 'all'}
                items={options.map(o => {
                  const account = accountsById.get(o.value)
                  return {
                    key: o.value || 'all',
                    label: o.label,
                    href: analysisHref(o.value || undefined, period),
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

            <section aria-labelledby="analysis-expense" className="space-y-4">
              <h2 id="analysis-expense" className="text-base font-semibold">הוצאות</h2>
              <CategoryAnalysis
                monthly={expense}
                year={year}
                month={month}
                basePath={basePath}
                categoryHref={href}
                emptyTitle={`אין הוצאות לשנת ${year}`}
                emptyText="העלה פירוט חיובים או קובץ תנועות מהבנק כדי לראות כאן את ההוצאות לפי קטגוריה וחודש."
                unit={cardIds.length && !bankIds.length ? 'חיובים' : 'תנועות'}
              />
            </section>

            {bankIds.length > 0 && (
              <section aria-labelledby="analysis-income" className="space-y-4">
                <h2 id="analysis-income" className="text-base font-semibold">הכנסות</h2>
                <CategoryAnalysis
                  monthly={inMonthly}
                  year={year}
                  month={month}
                  basePath={basePath}
                  categoryHref={href}
                  emptyTitle={`אין הכנסות לשנת ${year}`}
                  emptyText="העלה קובץ תנועות מהבנק כדי לראות כאן את ההכנסות לפי קטגוריה וחודש."
                  chartTitle="הכנסות לפי קטגוריה לאורך השנה"
                  unit="תנועות"
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
