import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { withQuery } from '@/lib/accounts/routes'
import type { BankDirection } from '@/lib/insights/bank-categories'

const OPTIONS: { value?: 'in' | 'out'; direction?: BankDirection; label: string }[] = [
  { label: 'הכל' },
  { value: 'in', direction: 'IN', label: 'הכנסות' },
  { value: 'out', direction: 'OUT', label: 'הוצאות' },
]

/**
 * All / income / expenses for a bank page (`?flow=in|out`), keeping the page's
 * other params. The category filter is dropped: a category belongs to one side.
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
  return (
    <nav aria-label="הכנסות או הוצאות" className="inline-flex rounded-lg border bg-card p-0.5">
      {OPTIONS.map(o => {
        const { flow: _flow, category: _category, ...rest } = params
        const active = o.direction === current
        return (
          <Link
            key={o.label}
            href={withQuery(basePath, { ...rest, ...(o.value ? { flow: o.value } : {}) })}
            scroll={false}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}
