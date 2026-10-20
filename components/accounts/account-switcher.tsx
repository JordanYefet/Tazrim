'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { withQuery } from '@/lib/accounts/routes'
import { routeAccountId } from '@/lib/nav/state'
import { SECTION_ITEMS, useNavSections } from '@/components/layout/nav-context'
import { AccountMini } from './account-element'
import { CardTransitionLink } from '@/components/cards/card-transition'

/**
 * Phone-only pills under the heading of /banks* and /cards*:
 * "כל הכרטיסים · <each card>", keeping the selected period.
 * (On md+ the sidebar lists the accounts instead.)
 */
export function AccountSwitcher() {
  const pathname = usePathname()
  const params = useSearchParams()
  const sections = useNavSections()
  const activeRef = useRef<HTMLAnchorElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const item = pathname === '/banks' || pathname.startsWith('/banks/')
    ? SECTION_ITEMS.banks
    : pathname === '/cards' || pathname.startsWith('/cards/')
      ? SECTION_ITEMS.cards
      : null
  const accounts = item ? sections[item.key] : []
  const currentId = item ? routeAccountId(pathname, item.kind) : null

  // Bring the current pill into view when the row is wider than the screen
  // (scrolls the row only, never the page; relative deltas work in RTL too)
  useEffect(() => {
    const ul = listRef.current
    const el = activeRef.current
    if (!ul || !el) return
    const u = ul.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const pad = 16
    if (r.left < u.left + pad) ul.scrollBy({ left: r.left - u.left - pad })
    else if (r.right > u.right - pad) ul.scrollBy({ left: r.right - u.right + pad })
  }, [pathname])

  if (!item || accounts.length === 0) return null

  const period = {
    ...(params.get('year') ? { year: params.get('year')! } : {}),
    ...(params.get('month') ? { month: params.get('month')! } : {}),
  }
  const pills = [
    { key: 'all', href: item.href, label: item.allLabel, account: undefined, current: pathname === item.href },
    ...accounts.map(a => ({ key: a.id, href: a.href, label: a.name, account: a, current: a.id === currentId })),
  ]

  return (
    <nav aria-label={`בחירת ${item.key === 'cards' ? 'כרטיס' : 'חשבון'}`} className="-mx-4 md:hidden">
      <ul ref={listRef} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-0.5">
        {pills.map(p => (
          <li key={p.key} className="shrink-0">
            <CardTransitionLink
              transition={item.key === 'cards'}
              ref={p.current ? activeRef : undefined}
              href={withQuery(p.href, period)}
              aria-current={p.current ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-[background-color,color,transform] duration-150 active:scale-[0.97]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                p.current
                  ? 'border-primary/45 bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {p.account && (
                <AccountMini kind={item.kind} provider={p.account.provider} color={p.account.color} network={p.account.cardNetwork} className="w-[22px]" />
              )}
              {p.label}
              {p.account?.lastFour && (
                <span dir="ltr" className="text-[11px] tabular-nums opacity-70">·{p.account.lastFour}</span>
              )}
            </CardTransitionLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
