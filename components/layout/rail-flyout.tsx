'use client'

import { cloneElement, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import type { NavAccount, NavSectionItem } from './nav-context'
import { usePeriodHref } from './period-context'

const CLOSE_DELAY_MS = 140

/**
 * Collapsed-rail section (בנקים / כרטיסי אשראי): hovering the icon with a
 * mouse, or focusing it from the keyboard, opens a panel beside the rail with
 * "כל ה…" and every account. Tab walks into the panel, Escape closes it and
 * returns focus to the icon. Touch taps just follow the icon's link: touch
 * pointers and non-keyboard focus never open it.
 *
 * The panel is position: fixed (not portalled) so the rail's overflow does
 * not clip it, while it stays inside this wrapper for hover and focus.
 */
export function RailFlyout({
  item,
  accounts,
  currentId,
  pathname,
  children,
}: {
  item: NavSectionItem
  accounts: NavAccount[]
  currentId: string | null
  pathname: string
  /** The rail icon link */
  children: React.ReactElement
}) {
  const periodHref = usePeriodHref()
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const skipFocusOpen = useRef(false)
  const panelId = `rail-${item.key}-flyout`
  const open = pos !== null

  function show() {
    window.clearTimeout(closeTimer.current)
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top, right: window.innerWidth - r.left })
  }

  function hide(delay = CLOSE_DELAY_MS) {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setPos(null), delay)
  }

  // Close after navigating from the panel, and on unmount
  useEffect(() => setPos(null), [pathname])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  function onFocus(e: React.FocusEvent) {
    if (skipFocusOpen.current) {
      skipFocusOpen.current = false
      return
    }
    // Opening on a mouse click or touch focus would cover the page for nothing
    if (e.target instanceof HTMLElement && !e.target.matches(':focus-visible')) return
    show()
  }

  function onBlur(e: React.FocusEvent) {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) hide(0)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      window.clearTimeout(closeTimer.current)
      setPos(null)
      const trigger = wrapRef.current?.querySelector<HTMLElement>('a')
      // Moving focus back fires a focus event that must not reopen the panel
      if (trigger && document.activeElement !== trigger) {
        skipFocusOpen.current = true
        trigger.focus()
      }
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      const links = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>(`#${panelId} a`) ?? [])
      const i = links.indexOf(document.activeElement as HTMLElement)
      links[Math.min(i + 1, links.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      const links = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>(`#${panelId} a`) ?? [])
      const i = links.indexOf(document.activeElement as HTMLElement)
      if (i <= 0) wrapRef.current?.querySelector<HTMLElement>('a')?.focus()
      else links[i - 1]?.focus()
    }
  }

  const link = (href: string, current: boolean, content: React.ReactNode, muted = false) => (
    <Link
      key={href}
      href={periodHref(href)}
      aria-current={current ? 'page' : undefined}
      onClick={() => setPos(null)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        current ? 'bg-primary/10 font-medium text-primary' : muted ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'hover:bg-muted'
      )}
    >
      {content}
    </Link>
  )

  return (
    <div
      ref={wrapRef}
      onPointerEnter={e => e.pointerType === 'mouse' && show()}
      onPointerLeave={e => e.pointerType === 'mouse' && hide()}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'aria-expanded': open,
        'aria-controls': open ? panelId : undefined,
      })}
      {open && (
        // The padding bridges the gap to the icon, so the pointer can cross it without closing the panel
        <div className="fixed z-50 ps-6" style={{ top: pos.top - 8, right: pos.right - 4 }}>
          <div
            id={panelId}
            role="group"
            aria-label={item.label}
            className="flyout-in flex max-h-[calc(100vh-2rem)] w-56 flex-col gap-0.5 overflow-y-auto rounded-xl surface-overlay bg-card/95 p-2 backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-card"
          >
            <p className="mx-2.5 mb-1 mt-0.5 text-xs font-semibold text-muted-foreground">{item.label}</p>
            {link(item.href, pathname === item.href, item.allLabel, true)}
            {accounts.map(a =>
              link(
                a.href,
                a.id === currentId,
                <>
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="min-w-0 truncate">{a.name}</span>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
