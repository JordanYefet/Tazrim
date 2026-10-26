'use client'

import { useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * One way transactions get a category automatically, as a row that opens to its list.
 * Closed by default; a link to /categories#<id> arrives with it open.
 */
export function RuleSection({ id, title, summary, count, children }: {
  id: string
  title: string
  summary: string
  count: number
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    // On arrival, and when only the hash changes (a link from this same page)
    const openIfTarget = () => {
      if (window.location.hash !== `#${id}` || !ref.current) return
      ref.current.open = true
      ref.current.scrollIntoView({ block: 'start' })
    }
    openIfTarget()
    window.addEventListener('hashchange', openIfTarget)
    return () => window.removeEventListener('hashchange', openIfTarget)
  }, [id])

  return (
    <details ref={ref} id={id} className="group scroll-mt-20 border-t">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{summary}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-5 sm:px-6">{children}</div>
    </details>
  )
}
