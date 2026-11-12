import Link from 'next/link'
import { ChartColumnStacked } from 'lucide-react'

/** "ניתוח לפי קטגוריה" link-button to a category analysis page. */
export function CategoryAnalysisLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      // Drawn 34px tall; the hit area is 46px (6px above and below, 4px each side), inside the card's header
      className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-[background-color,transform] duration-quick before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[''] hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChartColumnStacked className="h-4 w-4 text-muted-foreground" aria-hidden />
      ניתוח לפי קטגוריה
    </Link>
  )
}
