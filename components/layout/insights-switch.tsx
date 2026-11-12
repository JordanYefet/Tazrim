'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { INSIGHTS_PAGES, insightsPageOf, saveInsightsChoice } from '@/lib/nav/insights'
import { SegmentedTrack } from '@/components/ui/segmented'
import { usePeriodHref } from './period-context'

/**
 * Phone only: תחזית · קבועים · ניתוח. Lives in the (insights) layout so it stays
 * mounted while the pages change and the thumb can slide. The page shown is saved
 * as the "תובנות" tab's target (lib/nav/insights.ts).
 */
export function InsightsSwitch() {
  const pathname = usePathname()
  const periodHref = usePeriodHref()
  const current = insightsPageOf(pathname)

  useEffect(() => {
    if (current) saveInsightsChoice(current)
  }, [current])

  return (
    <SegmentedTrack
      as="nav"
      aria-label="תובנות"
      active={current}
      thumbClassName="rounded-[9px] bg-card shadow-sm"
      className="mb-4 grid h-11 auto-cols-fr grid-flow-col rounded-xl bg-muted p-[3px] md:hidden"
    >
      {INSIGHTS_PAGES.map(p => {
        const on = p.href === current
        return (
          <Link
            key={p.href}
            href={periodHref(p.href)}
            data-segment={p.href}
            data-on={on || undefined}
            aria-current={on ? 'page' : undefined}
            onClick={() => saveInsightsChoice(p.href)}
            className={cn(
              'flex items-center justify-center rounded-[9px] text-[15px] transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground'
            )}
          >
            {p.label}
          </Link>
        )
      })}
    </SegmentedTrack>
  )
}
