import Link from 'next/link'
import { RollingNumber } from '@/components/ui/rolling-number'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { SECTION } from '@/components/accounts/page-parts'
import { cn } from '@/lib/utils/cn'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { CategoryDonut } from '@/components/cards/category-donut'
import type { ProjectionCategory, ProjectionItem } from '@/lib/insights/projection'

const CADENCE: Record<string, string> = { weekly: 'שבועי', monthly: 'חודשי', bimonthly: 'דו-חודשי', yearly: 'שנתי' }

function ItemRows({ items, income, link }: { items: ProjectionItem[]; income?: boolean; link?: boolean }) {
  if (items.length === 0) return <p className="py-2.5 text-sm text-muted-foreground">אין</p>
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map(i => {
        const row = cn('flex items-center justify-between gap-3 py-2.5', link && '[@media(pointer:coarse)]:min-h-11')
        const content = (
          <>
            <span className="min-w-0 truncate">
              {i.name}
              {i.cadence && <span className="ms-2 text-xs text-muted-foreground">{CADENCE[i.cadence]}</span>}
            </span>
            <span className={cn('tabular-nums', income && 'text-[hsl(var(--income))]')}>
              {income ? '+' : '−'}<RollingNumber value={i.monthlyAmount} />
            </span>
          </>
        )
        return (
          <li key={i.key}>
            {link ? <Link href="/recurring" className={cn(row, 'hover:underline')}>{content}</Link> : <div className={row}>{content}</div>}
          </li>
        )
      })}
    </ul>
  )
}

function KindCard({ title, subtitle, dot, children }: { title: string; subtitle: string; dot: string; children: React.ReactNode }) {
  return (
    <section className={cn(SECTION, 'flex min-w-0 flex-col')}>
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

const MEDIAN = 'ממוצע חודשי: חציון של עד 24 החודשים האחרונים'

const TOP_RECURRING = 5

/**
 * The recurring charges in the forecast, kept short: the monthly total, the largest few, and a
 * link to /recurring for the rest (where an ended charge can be dismissed).
 */
export function ProjectionRecurring({ items }: { items: ProjectionItem[] }) {
  const recurring = items.filter(i => i.kind === 'recurring').sort((a, b) => b.monthlyAmount - a.monthlyAmount)
  const total = recurring.reduce((a, i) => a + i.monthlyAmount, 0)
  const more = recurring.length - TOP_RECURRING
  return (
    <KindCard
      title="חיובים קבועים בתחזית"
      subtitle={`${recurring.length} חיובים, ${formatCurrencyWhole(total)} בחודש, כל אחד במועד שלו`}
      dot="hsl(var(--muted-foreground))"
    >
      <ItemRows items={recurring.slice(0, TOP_RECURRING)} link />
      <Link href="/recurring" className="mt-auto inline-block pt-4 text-sm text-primary hover:underline">
        {more > 0 ? `עוד ${more} חיובים, ואפשר לסמן חיוב שהסתיים` : 'חיוב הסתיים? סמנו אותו בחיובים קבועים'}
      </Link>
    </KindCard>
  )
}

/** The everyday income the forecast expects each month */
export function ProjectionIncome({ items }: { items: ProjectionItem[] }) {
  return (
    <KindCard title="הכנסות צפויות" subtitle={MEDIAN} dot="hsl(var(--income))">
      <ItemRows items={items.filter(i => i.kind === 'everyday' && i.direction === 'in')} income />
    </KindCard>
  )
}

/** Expected spending per month by category, as the app's category donut */
export function ProjectionCategories({ categories }: { categories: ProjectionCategory[] }) {
  return (
    <CategoryDonut
      pagePath="/projection"
      title="הוצאות צפויות לפי קטגוריה"
      subtitle="בחודש: הוצאות שוטפות, חיובים קבועים וכרטיסי אשראי יחד"
      data={Object.fromEntries(categories.map(c => [c.name, c.monthlyAmount]))}
      colors={categoryColorMap(categories.map(c => c.name))}
      // The forecast has no transactions of its own to open: slices don't link
      categoryHrefs={{}}
      emptyText="אין הוצאות צפויות"
    />
  )
}
