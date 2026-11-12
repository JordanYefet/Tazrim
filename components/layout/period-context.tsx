'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cookieAssignment } from '@/lib/nav/state'
import {
  PERIOD_COOKIE,
  currentMonth,
  formatPeriodCookie,
  isPeriodPath,
  periodFromParams,
  periodQuery,
  samePeriod,
  withPeriod,
  type Period,
} from '@/lib/period'

/*
 * The remembered period (ENG-63). The root layout seeds it from the cookie;
 * every period page reports the period it rendered (<PeriodSync>), and the
 * header's pickers set it directly. Navigation links add it to their hrefs,
 * so moving around the app never drops the selected month.
 *
 * Changing the period (or the scope) of the page on screen runs as one transition
 * (`start`): the page that is shown stays, dimmed by <PageMain> while `pending`,
 * until the next one has arrived, and then the numbers roll to their new values.
 * No skeleton, no blank. The header's pickers, the charts' month clicks and
 * <PeriodLink> all navigate through it.
 */

interface PeriodContextValue {
  period: Period
  remember: (p: Period) => void
  /** This calendar month: the header's "back to this month" button */
  today: Period
  /** A period or scope navigation is in flight: the page on screen is the one before it */
  pending: boolean
  /** Runs `navigate` (a router.push) as the period transition, so `pending` covers it */
  start: (navigate: () => void) => void
}

const PeriodContext = createContext<PeriodContextValue>({
  period: { year: new Date().getFullYear() },
  remember: () => {},
  today: currentMonth(),
  pending: false,
  start: navigate => navigate(),
})

function writePeriodCookie(p: Period) {
  document.cookie = cookieAssignment(PERIOD_COOKIE, formatPeriodCookie(p))
}

export function PeriodProvider({
  initial,
  today: serverToday,
  children,
}: {
  initial: Period
  /** This month by the server's clock, so the first paint matches the server's HTML */
  today: Period
  children: React.ReactNode
}) {
  const [period, setPeriod] = useState<Period>(initial)
  const [today, setToday] = useState<Period>(serverToday)
  const [pending, start] = useTransition()

  // Then the browser's clock wins (they differ only around midnight on the 1st, or a
  // browser in another zone), checked again when the app comes back to the front
  useEffect(() => {
    const check = () => {
      const now = currentMonth()
      setToday(prev => (samePeriod(prev, now) ? prev : now))
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  const remember = useCallback((p: Period) => {
    const next = p.month ? { year: p.year, month: p.month } : { year: p.year }
    setPeriod(prev => (samePeriod(prev, next) ? prev : next))
    writePeriodCookie(next)
  }, [])

  const value = useMemo(() => ({ period, remember, today, pending, start }), [period, remember, today, pending, start])
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

/** The remembered period (what the current page shows, or showed last). */
export function usePeriod(): Period {
  return useContext(PeriodContext).period
}

/** This calendar month (server's clock on the first paint, then the browser's). */
export function useToday(): Period {
  return useContext(PeriodContext).today
}

export function useRememberPeriod(): (p: Period) => void {
  return useContext(PeriodContext).remember
}

/** Whether a period or scope navigation is in flight (the page on screen is the old one, dimmed). */
export function usePeriodPending(): boolean {
  return useContext(PeriodContext).pending
}

/** The period transition: run a navigation (and any optimistic update beside it) inside it. */
export function usePeriodTransition(): (navigate: () => void) => void {
  return useContext(PeriodContext).start
}

/**
 * Navigates to `href` as the period transition: for the charts' month clicks and
 * other same-page moves that only change the period or the scope. The page stays
 * (dimmed) until the next one arrives; `scroll` is false by default, as those
 * clicks keep the reader where they were.
 */
export function usePeriodNavigation(): (href: string, options?: { scroll?: boolean }) => void {
  const router = useRouter()
  const start = usePeriodTransition()
  return useCallback(
    (href, options) => start(() => router.push(href, { scroll: options?.scroll ?? false })),
    [router, start]
  )
}

/**
 * The period on screen: on a period page the URL's (it is the truth there, and
 * leads the remembered one during back / forward), elsewhere the remembered
 * one. Uses useSearchParams, so callers render inside a Suspense boundary.
 */
export function useCurrentPeriod(): Period {
  const remembered = usePeriod()
  const pathname = usePathname()
  const params = useSearchParams()
  const url = isPeriodPath(pathname) ? periodFromParams(params) : null
  const fromUrl = url !== null
  const urlYear = url?.year
  const urlMonth = url?.month
  return useMemo(
    () => (fromUrl ? { year: urlYear ?? remembered.year, month: urlMonth } : remembered),
    [fromUrl, urlYear, urlMonth, remembered]
  )
}

/** `href` with the remembered period, for links into period pages (others unchanged). */
export function usePeriodHref(): (href: string) => string {
  const period = usePeriod()
  return useCallback((href: string) => withPeriod(href, period), [period])
}

/**
 * Rendered by every period page with the period it resolved (URL, cookie or
 * default). Remembers it, and when the URL did not name it (a bare link, a
 * fresh load) writes it into the URL in place, so the address bar, a reload
 * and back / forward all show the same period.
 */
export function PeriodSync({ year, month }: Period) {
  const remember = useRememberPeriod()

  useEffect(() => {
    remember({ year, month })
    const url = new URL(window.location.href)
    const q = periodQuery({ year, month })
    const sp = url.searchParams
    if (sp.get('year') === q.year && (sp.get('month') ?? undefined) === q.month) return
    const next = new URLSearchParams(q)
    for (const [k, v] of sp) if (k !== 'year' && k !== 'month') next.append(k, v)
    // Next.js syncs useSearchParams and keeps its router state (pass null state)
    window.history.replaceState(null, '', `${url.pathname}?${next.toString()}${url.hash}`)
  }, [year, month, remember])

  return null
}
