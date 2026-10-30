import Link from 'next/link'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'

/**
 * The overview's count of transactions without a category, in every period
 * (lib/db/uncategorized.ts), with a link to all of them in search.
 */
export function UncategorizedCard({ bank, card }: { bank: number; card: number }) {
  const total = bank + card
  return (
    <section className={`${SECTION} flex flex-col`}>
      <ChartHeader title="תנועות בלי קטגוריה" subtitle="מכל התקופות, בבנק ובכרטיסים" />
      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-[hsl(var(--income))]" aria-hidden />
          לכל התנועות יש קטגוריה
        </p>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-5">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <dt className="text-xs text-muted-foreground">בבנק</dt>
              <dd className="text-2xl font-semibold tabular-nums">{bank}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <dt className="text-xs text-muted-foreground">בכרטיסים</dt>
              <dd className="text-2xl font-semibold tabular-nums">{card}</dd>
            </div>
          </dl>
          <Link
            href="/search?uncategorized=1"
            className="group inline-flex items-center justify-center gap-1 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-[background-color,transform] hover:bg-primary/15 active:scale-[0.98]"
          >
            {total === 1 ? 'להצגת התנועה' : `להצגת כל ה־${total}`}
            <ChevronLeft className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
          </Link>
        </div>
      )}
    </section>
  )
}
