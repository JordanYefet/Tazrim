import { CalendarClock, Upload } from 'lucide-react'
import { getProjection } from '@/lib/db/projection'
import { EmptyState } from '@/components/accounts/page-parts'
import { BankPicker } from '@/components/projection/bank-picker'
import { ProjectionHero } from '@/components/projection/projection-hero'
import { ProjectionChartCard } from '@/components/projection/projection-chart-card'
import { ProjectionCategoryLines } from '@/components/projection/projection-category-lines'
import { SelectedMonthProvider } from '@/components/projection/selected-month'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'תחזית · תזרים' }

/** The next 12 months of the bank balance (ENG-87, docs/superpowers/specs/2026-11-02-projection-design.md) */
export default async function ProjectionPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams
  const p = await getProjection({ accountId: account })

  return (
    <div className="page-in mx-auto min-w-0 max-w-7xl space-y-6">
      <div className="flex min-h-[2.375rem] items-end">
        <h1 className="text-2xl font-semibold tracking-tight">תחזית</h1>
      </div>
      {p.banks.length > 1 && <BankPicker banks={p.banks} active={p.accountId} />}

      {p.insufficient ? (
        <EmptyState
          icon={p.banks.length ? CalendarClock : Upload}
          title={p.banks.length ? 'צריך עוד קצת היסטוריה' : 'אין עדיין חשבון בנק'}
          text={
            p.banks.length
              ? `כדי לחזות את השנה הקרובה צריך לפחות 3 חודשים מלאים של תנועות בנק. יש כרגע ${p.completeMonths}.`
              : 'הוסיפו חשבון בנק והעלו לפחות 3 חודשים של תנועות כדי לראות תחזית.'
          }
          actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
        />
      ) : (
        <SelectedMonthProvider>
          {/* The 12 months (or the month picked on either chart) beside the balance timeline, in
              two equal halves; how each category moves, full width below */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectionHero months={p.months} start={p.start.balance} end={p.end} tight={p.tight} cushion={p.cushion} />
            <ProjectionChartCard past={p.past} months={p.months} start={p.start.balance} cushion={p.cushion} seasonal={p.seasonal} />
          </div>
          <ProjectionCategoryLines
            actual={p.actualCategories}
            months={p.months}
            recurring={{
              count: p.items.filter(i => i.kind === 'recurring').length,
              monthly: p.items.filter(i => i.kind === 'recurring').reduce((a, i) => a + i.monthlyAmount, 0),
            }}
          />
        </SelectedMonthProvider>
      )}
    </div>
  )
}
