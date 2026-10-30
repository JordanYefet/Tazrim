import Link from 'next/link'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { SECTION } from '@/components/accounts/page-parts'

/**
 * The overview's count of transactions without a category, in every period
 * (lib/db/uncategorized.ts): a compact card, linking to all of them in search.
 * Kept small on purpose; "שווה בדיקה" is the card that matters more.
 */
export function UncategorizedCard({ bank, card, className }: { bank: number; card: number; className?: string }) {
  const total = bank + card
  if (total === 0) {
    return (
      <section className={cn(SECTION, 'flex items-center gap-2.5 py-4 sm:py-4', className)}>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(var(--income))]" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">תנועות בלי קטגוריה:</span>{' '}
          <span className="text-muted-foreground">אין, לכל התנועות יש קטגוריה</span>
        </p>
      </section>
    )
  }
  return (
    <Link
      href="/search?uncategorized=1"
      className={cn(SECTION, 'group flex items-center gap-3 py-4 transition-colors hover:bg-muted/30 sm:py-4', className)}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {total === 1 ? 'תנועה אחת בלי קטגוריה' : `${total} תנועות בלי קטגוריה`}
        </span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {bank} בבנק · {card} בכרטיסים · מכל התקופות
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
        להצגה
        <ChevronLeft className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
      </span>
    </Link>
  )
}
