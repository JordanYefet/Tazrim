import Link from 'next/link'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { SECTION } from '@/components/accounts/page-parts'
import { cn } from '@/lib/utils/cn'
import type { ProjectionItem } from '@/lib/insights/projection'

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

function KindCard({ title, dot, children }: { title: string; dot: string; children: React.ReactNode }) {
  return (
    <section className={cn(SECTION, 'flex flex-col')}>
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}

/** What the forecast is made of, in three cards by kind; recurring items link to /recurring, where an ended one can be dismissed */
export function ProjectionItems({ items }: { items: ProjectionItem[] }) {
  const income = items.filter(i => i.kind === 'everyday' && i.direction === 'in')
  const recurring = items.filter(i => i.kind === 'recurring')
  const everyday = items.filter(i => (i.kind === 'everyday' || i.kind === 'card') && i.direction === 'out')
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">מה נכנס לתחזית</h2>
        <p className="text-sm text-muted-foreground">ממוצע חודשי (חציון של 6 החודשים האחרונים) וחיובים קבועים</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <KindCard title="נכנס" dot="hsl(var(--income))">
          <ItemRows items={income} income />
        </KindCard>
        <KindCard title="קבועים" dot="hsl(var(--muted-foreground))">
          <ItemRows items={recurring} link />
          <Link href="/recurring" className="mt-auto inline-block pt-4 text-sm text-primary hover:underline">
            חיוב הסתיים? סמנו אותו בחיובים קבועים
          </Link>
        </KindCard>
        <KindCard title="הוצאות שוטפות" dot="hsl(var(--expense))">
          <ItemRows items={everyday} />
        </KindCard>
      </div>
    </div>
  )
}
