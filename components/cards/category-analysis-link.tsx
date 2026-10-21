import Link from 'next/link'
import { ChartColumnStacked } from 'lucide-react'

/** "ניתוח לפי קטגוריה" link-button to a category analysis page. */
export function CategoryAnalysisLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-[background-color,transform] duration-quick hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChartColumnStacked className="h-4 w-4 text-muted-foreground" aria-hidden />
      ניתוח לפי קטגוריה
    </Link>
  )
}
