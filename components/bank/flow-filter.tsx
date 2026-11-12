'use client'

import { startTransition, useOptimistic } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { withQuery } from '@/lib/accounts/routes'
import type { BankDirection } from '@/lib/insights/bank-categories'
import { pillClass } from '@/components/accounts/account-pills'

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
 * Pills, like the account filters (not a segmented control, so it doesn't read as the
 * phone's "תנועות / מגמות" switch above it). The pick shows on the click, not when the
 * new page arrives: it is optimistic for as long as the navigation runs, then `current`
 * (the URL) takes over again, so back / forward land on the right option too.
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
    <nav aria-label="הכנסות או הוצאות">
      <ul className="flex gap-2">
        {OPTIONS.map(o => {
          const key = keyOf(o.direction)
          const href = withQuery(basePath, { ...rest, ...(o.value ? { flow: o.value } : {}) })
          const active = key === shown
          return (
            <li key={key}>
              <Link
                href={href}
                scroll={false}
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
                className={pillClass(active)}
              >
                {o.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
