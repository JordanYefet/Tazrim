'use client'

import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'
import { usePeriodNavigation } from './period-context'

/**
 * A Link that stays on a period page and only changes its period or scope (a month
 * column of a category's year, a scope pill): a plain click navigates as the period
 * transition (period-context.tsx), so the page on screen stays, dimmed, until the
 * next one arrives. A modified click (a new tab) and the keyboard are the browser's,
 * and the link prefetches as any Link does.
 */
export function PeriodLink({ href, scroll, onClick, target, ...rest }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const navigate = usePeriodNavigation()
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (target && target !== '_self') return
    e.preventDefault()
    navigate(href, { scroll: scroll ?? true })
  }
  return <Link href={href} scroll={scroll} target={target} onClick={handleClick} {...rest} />
}
