'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { cookieAssignment } from '@/lib/nav/state'
import {
  PERIOD_COOKIE,
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
 */

interface PeriodContextValue {
  period: Period
  remember: (p: Period) => void
}

const PeriodContext = createContext<PeriodContextValue>({
  period: { year: new Date().getFullYear() },
  remember: () => {},
})

function writePeriodCookie(p: Period) {
  document.cookie = cookieAssignment(PERIOD_COOKIE, formatPeriodCookie(p))
}

export function PeriodProvider({ initial, children }: { initial: Period; children: React.ReactNode }) {
  const [period, setPeriod] = useState<Period>(initial)

  const remember = useCallback((p: Period) => {
    const next = p.month ? { year: p.year, month: p.month } : { year: p.year }
    setPeriod(prev => (samePeriod(prev, next) ? prev : next))
    writePeriodCookie(next)
  }, [])

  const value = useMemo(() => ({ period, remember }), [period, remember])
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

/** The remembered period (what the current page shows, or showed last). */
export function usePeriod(): Period {
  return useContext(PeriodContext).period
}

export function useRememberPeriod(): (p: Period) => void {
  return useContext(PeriodContext).remember
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
