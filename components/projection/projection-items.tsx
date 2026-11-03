import Link from 'next/link'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { SECTION } from '@/components/accounts/page-parts'
import { cn } from '@/lib/utils/cn'
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
              {income ? '+' : '−'}{formatCurrencyWhole(i.monthlyAmount)}
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

const MEDIAN = 'ממוצע חודשי: חציון 6 החודשים האחרונים'

/** The recurring items the forecast places on their own dates; each links to /recurring, where an ended one can be dismissed */
export function ProjectionRecurring({ items }: { items: ProjectionItem[] }) {
  return (
    <KindCard title="חיובים קבועים בתחזית" subtitle="כל חיוב נכנס לתחזית במועד שלו" dot="hsl(var(--muted-foreground))">
      <ItemRows items={items.filter(i => i.kind === 'recurring')} link />
      <Link href="/recurring" className="mt-auto inline-block pt-4 text-sm text-primary hover:underline">
        חיוב הסתיים? סמנו אותו בחיובים קבועים
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

/** Expected spending per month by category: everyday, recurring and card spending together, largest first */
export function ProjectionCategories({ categories }: { categories: ProjectionCategory[] }) {
  const max = categories[0]?.monthlyAmount ?? 0
  return (
    <KindCard title="הוצאות צפויות לפי קטגוריה" subtitle="בחודש: הוצאות שוטפות, חיובים קבועים וכרטיסי אשראי יחד" dot="hsl(var(--expense))">
      {categories.length === 0 ? (
        <p className="py-2.5 text-sm text-muted-foreground">אין</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {categories.map(c => (
            <li key={c.name}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="tabular-nums">{formatCurrencyWhole(c.monthlyAmount)}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-[hsl(var(--expense)/0.6)]" style={{ width: `${max ? Math.max(2, (c.monthlyAmount / max) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </KindCard>
  )
}
