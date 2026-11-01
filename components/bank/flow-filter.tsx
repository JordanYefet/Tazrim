'use client'

import { startTransition, useOptimistic } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { withQuery } from '@/lib/accounts/routes'
import type { BankDirection } from '@/lib/insights/bank-categories'
import { SegmentedTrack } from '@/components/ui/segmented'

const OPTIONS: { value?: 'in' | 'out'; direction?: BankDirection; label: string }[] = [
  { label: 'הכל' },
  { value: 'in', direction: 'IN', label: 'הכנסות' },
  { value: 'out', direction: 'OUT', label: 'הוצאות' },
]

const keyOf = (d?: BankDirection) => d ?? 'ALL'

/**
 * All / income / expenses for a bank page (`?flow=in|out`), keeping the page's
 * other params. The category filter is dropped: a category belongs to one side.
 *
 * The thumb moves on the click, not when the new page arrives: the pick is
 * optimistic for as long as the navigation runs, then `current` (the URL)
 * takes over again, so back / forward land on the right option too.
 */
export function FlowFilter({
  basePath,
  params,
  current,
}: {
  basePath: string
  params: Record<string, string | undefined>
  current?: BankDirection
}) {
  const router = useRouter()
  const [shown, setShown] = useOptimistic(keyOf(current))
  const { flow: _flow, category: _category, ...rest } = params

  return (
    <SegmentedTrack
      as="nav"
      aria-label="הכנסות או הוצאות"
      active={shown}
      // The table around it remounts on the new flow; the slide carries over
      carryId={`flow:${basePath}`}
      thumbClassName="rounded-md bg-primary/10"
      className="inline-flex rounded-lg border bg-card p-0.5"
    >
      {OPTIONS.map(o => {
        const key = keyOf(o.direction)
        const href = withQuery(basePath, { ...rest, ...(o.value ? { flow: o.value } : {}) })
        const active = key === shown
        return (
          <Link
            key={key}
            href={href}
            scroll={false}
            data-segment={key}
            data-on={active || undefined}
            aria-current={key === keyOf(current) ? 'true' : undefined}
            onClick={e => {
              // A new tab / window keeps the plain link
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              e.preventDefault()
              startTransition(() => {
                setShown(key)
                router.push(href, { scroll: false })
              })
            }}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors duration-base ease-ui',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </SegmentedTrack>
  )
}
