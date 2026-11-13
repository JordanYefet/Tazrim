'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHeaderHidden } from './use-header-hidden'
import { ROUTE_CALM_MS, stillEngaged, tabBarShrunk } from '@/lib/nav/tab-bar-shrink'

/**
 * Whether the phone tab bar is shrunk (lib/nav/tab-bar-shrink.ts): the header's
 * scroll signal, unless the sheet is open, a route just changed or the bar was
 * just touched (`engage`, called on a touch on the bar).
 */
export function useTabBarShrunk({ sheetOpen, routeKey }: { sheetOpen: boolean; routeKey: string }) {
  const headerHidden = useHeaderHidden()
  const [calm, setCalm] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const engagedAt = useRef(0)

  // Right after a route change the bar is full, whatever the new page's scroll does
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setCalm(true)
    const timer = window.setTimeout(() => setCalm(false), ROUTE_CALM_MS)
    return () => window.clearTimeout(timer)
  }, [routeKey])

  // A touch holds the bar open until the page moves down another stretch (or the header comes back)
  useEffect(() => {
    if (!headerHidden) setEngaged(false)
  }, [headerHidden])
  useEffect(() => {
    if (!engaged) return
    const onScroll = () => {
      if (!stillEngaged(engagedAt.current, window.scrollY)) setEngaged(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [engaged])

  const engage = useCallback(() => {
    engagedAt.current = window.scrollY
    setEngaged(true)
  }, [])

  return { shrunk: tabBarShrunk({ headerHidden, sheetOpen, calm, engaged }), engage }
}
