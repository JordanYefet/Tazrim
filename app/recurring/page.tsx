import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { RecurringList, type RecurringListItem } from '@/components/insights/recurring-list'
import { SeriesRow } from '@/components/recurring/series-window'
import { getRecurringSeries, type AppliedSeries } from '@/lib/db/recurring'
import { formatCurrencyWhole } from '@/lib/utils/currency'

export const dynamic = 'force-dynamic'

interface SearchParams { account?: string }

// A row opens the series' window with its actions (components/recurring/series-window.tsx)
function rowFor(s: RecurringListItem, content: React.ReactNode) {
  return <SeriesRow series={s as AppliedSeries}>{content}</SeriesRow>
}

function Collapsible({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <details className="group rounded-xl surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/50 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span>
          {title} <span className="text-muted-foreground tabular-nums">({count})</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t">{children}</div>
    </details>
  )
}

export default async function RecurringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { account } = await searchParams
  const r = await getRecurringSeries({ accountId: account || undefined })
  const multipleAccounts = new Set(r.series.map(s => s.accountId)).size > 1
  const accountNames = multipleAccounts ? r.accountNames : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">לפי כל התנועות שהועלו</p>
        <h1 className="text-2xl font-semibold tracking-tight">חיובים קבועים</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          חיובים שחוזרים בסכום דומה כל חודש. אשרו את מה שנכון, הסתירו את מה שלא, ושנו שם כדי שיהיה ברור.
          חיוב שלא זוהה אפשר לסמן מכל תנועה, גם כשהסכום שלו משתנה.
        </p>
      </div>

      <RecurringList
        title="מנויים וחיובים קבועים"
        subtitle={`${r.subscriptions.length} פעילים · ${formatCurrencyWhole(r.total * 12)} בשנה`}
        series={r.subscriptions}
        total={r.total}
        accountNames={accountNames}
        wrapRow={rowFor}
      />

      {r.installments.length > 0 && (
        <RecurringList
          title="עסקאות בתשלומים"
          subtitle="רכישה שמשולמת בחלקים. לא נספרת כמנוי."
          series={r.installments}
          total={r.installmentsTotal}
          accountNames={accountNames}
          wrapRow={rowFor}
        />
      )}

      {r.cardPayments.length > 0 && (
        <RecurringList
          title="חיובי כרטיס אשראי בבנק"
          subtitle="החיוב החודשי של הכרטיס בבנק כבר כולל את החיובים בכרטיס, ולכן לא נספר בסך הכול."
          series={r.cardPayments}
          accountNames={accountNames}
          wrapRow={rowFor}
        />
      )}

      <Collapsible title="הופסקו" count={r.inactive.length}>
        <RecurringList
          className="rounded-none border-0"
          title="חיובים שהופסקו"
          subtitle="לא היה חיוב יותר מחודשיים"
          series={r.inactive}
          accountNames={accountNames}
          wrapRow={rowFor}
        />
      </Collapsible>

      <Collapsible title="מוסתרים" count={r.dismissed.length}>
        <RecurringList
          className="rounded-none border-0"
          title="מוסתרים"
          subtitle="לא נספרים בסך הכול. אפשר לשחזר."
          series={r.dismissed}
          accountNames={accountNames}
          wrapRow={rowFor}
        />
      </Collapsible>

      {account && (
        <Link href="/recurring" className="inline-block text-sm text-primary hover:underline">
          הצג את כל החשבונות
        </Link>
      )}
    </div>
  )
}
