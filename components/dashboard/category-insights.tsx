import Link from 'next/link'
import { ArrowDown, ArrowUp, Sparkles, Zap } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { monthName } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import type { CategoryInsight, CategoryInsights as Insights } from '@/lib/insights/category-insights'

interface Props {
  insights: Insights | null
  /** The month being compared (selected, or latest with card data) */
  month: number | null
  year: string
  colors: Record<string, string>
  /** Name used in the empty states: the card's name, or a generic one with several cards */
  cardsName?: string
  /** Active cards; the filter is shown only when there are 2 or more */
  cardOptions?: { id: string; label: string }[]
  /** The `?card=` filter in effect (undefined = all cards) */
  selectedCard?: string
  /** Current year/month query string, for the filter links */
  query?: string
}

function baselineLabel(months: number[]) {
  if (months.length === 0) return ''
  const first = monthName(months[0])
  const last = monthName(months[months.length - 1])
  return months.length === 1 ? first : `${first}–${last}`
}

function Badge({ item }: { item: CategoryInsight }) {
  const base = 'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums'
  if (item.kind === 'new') {
    return (
      <span className={cn(base, 'bg-primary/10 text-primary')}>
        <Sparkles className="h-3 w-3" aria-hidden />
        חדש
      </span>
    )
  }
  if (item.kind === 'spike') {
    return (
      <span className={cn(base, 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))]')}>
        <Zap className="h-3 w-3" aria-hidden />
        חריג
      </span>
    )
  }
  const up = item.kind === 'up'
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        base,
        up
          ? 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))]'
          : 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]'
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <RollingNumber value={Math.round(Math.abs(item.deltaPct ?? 0) * 100)} format="percent" />
    </span>
  )
}

function CardFilter({ options, selected, query }: { options: { id: string; label: string }[]; selected?: string; query: string }) {
  const items = [{ id: undefined as string | undefined, label: 'כל הכרטיסים' }, ...options]
  return (
    <nav aria-label="סינון לפי כרטיס" className="mb-4 flex flex-wrap gap-1.5">
      {items.map(o => {
        const sp = new URLSearchParams(query)
        if (o.id) sp.set('card', o.id)
        const active = o.id === selected
        return (
          <Link
            key={o.id ?? 'all'}
            href={`/?${sp}`}
            scroll={false}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function CategoryInsights({
  insights,
  month,
  year,
  colors,
  cardsName = 'מקס',
  cardOptions = [],
  selectedCard,
  query = '',
}: Props) {
  return (
    <section className="flex flex-col rounded-xl border bg-card p-4 sm:p-6">
      <h3 className="font-semibold text-base">שינויים בהוצאות בכרטיס</h3>
      <p className="text-sm text-muted-foreground mb-4">
        {insights
          ? `${monthName(insights.month)} מול הממוצע של ${baselineLabel(insights.baselineMonths)}`
          : 'השוואה של החודש לחודשים הקודמים'}
      </p>
      {cardOptions.length > 1 && <CardFilter options={cardOptions} selected={selectedCard} query={query} />}

      {!insights ? (
        <p className="my-auto py-6 text-center text-sm text-muted-foreground text-pretty">
          {month
            ? `אין מספיק נתונים להשוואה של ${monthName(month)}. צריך חיובי ${cardsName} גם לפחות לשני חודשים קודמים.`
            : `עדיין אין חיובי ${cardsName} לשנה זו.`}
        </p>
      ) : insights.items.length === 0 ? (
        <p className="my-auto py-6 text-center text-sm text-muted-foreground">
          אין שינויים משמעותיים — ההוצאות בכל הקטגוריות קרובות לממוצע.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {insights.items.map(item => {
            const sp = new URLSearchParams({ year, month: String(insights.month), category: item.category })
            return (
              <li key={item.category}>
                <Link
                  href={`/cards/max?${sp}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colors[item.category] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.category}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {item.kind === 'new'
                        ? 'לא היו הוצאות בחודשים הקודמים'
                        : (
                          <>
                            ממוצע <RollingNumber value={item.average} /> ·{' '}
                            <RollingNumber value={Math.abs(item.delta)} /> {item.delta > 0 ? 'יותר' : 'פחות'}
                          </>
                        )}
                    </span>
                  </span>
                  <RollingNumber value={item.current} className="text-sm font-semibold" />
                  <Badge item={item} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
