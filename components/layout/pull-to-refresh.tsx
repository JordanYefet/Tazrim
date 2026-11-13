'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { MOTION } from '@/lib/motion'
import { PULL_INITIAL, canStartPull, pullReducer, spinRemaining, type PullEvent, type PullState } from '@/lib/nav/pull-refresh'

/** Dialogs, sheets and menus: while one is open the page under it does not pull */
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
/** Things that handle drags themselves: the card wallet, or anything marked */
const DRAG_SURFACES = '.wallet, [data-no-pull]'

function isInstalledApp() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return standalone && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
}

/** Whether the touch began inside a scroller that is itself scrolled down: that drag is its own */
function inScrolledScroller(target: Element | null) {
  for (let el = target; el && el !== document.documentElement; el = el.parentElement) {
    if (el.scrollTop <= 0 || el.scrollHeight <= el.clientHeight + 1) continue
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return true
  }
  return false
}

/**
 * Pull to refresh for the installed app (lib/nav/pull-refresh.ts): an installed
 * PWA has no browser chrome, so nothing else reloads a page. Pulling down at the
 * very top refreshes the page's data with router.refresh() (the same call as
 * components/layout/fresh-data.tsx: fresh server data, the page stays in place).
 * Only in the standalone app; a browser tab keeps its own. The listeners are
 * passive and never prevent anything: iOS rubber-bands the page natively and the
 * round indicator shows over that gap, following the finger at half its pace.
 * While refreshing it spins until the refresh is done and at least half a second
 * has passed, then fades away. Renders nothing elsewhere.
 */
export function PullToRefresh() {
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const chip = useRef<HTMLDivElement>(null)
  const state = useRef<PullState>(PULL_INITIAL)
  const startedAt = useRef(0)
  const leaveTimer = useRef(0)
  const dispatchRef = useRef<(e: PullEvent) => void>(() => {})

  useEffect(() => setEnabled(isInstalledApp()), [])

  useEffect(() => {
    if (!enabled) return
    const paint = () => {
      const el = chip.current
      if (!el) return
      const s = state.current
      el.style.setProperty('--pull', String(s.pull))
      el.dataset.phase = s.phase
      if (s.armed) el.dataset.armed = ''
      else delete el.dataset.armed
    }
    dispatchRef.current = event => {
      const before = state.current.phase
      state.current = pullReducer(state.current, event)
      if (before !== 'refreshing' && state.current.phase === 'refreshing') {
        startedAt.current = performance.now()
        window.clearTimeout(leaveTimer.current)
        delete chip.current?.dataset.leaving
        setRefreshing(true)
        startTransition(() => router.refresh())
      }
      paint()
    }

    const onStart = (e: TouchEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const ok = canStartPull({
        scrollY: Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0),
        touches: e.touches.length,
        overlayOpen: !!document.querySelector(OVERLAYS) || document.body.hasAttribute('data-scroll-locked'),
        onTabBar: !!target?.closest('.tab-bar'),
        inScrolledScroller: inScrolledScroller(target),
        onDragSurface: !!target?.closest(DRAG_SURFACES),
      })
      if (ok) dispatchRef.current({ type: 'start', x: e.touches[0].clientX, y: e.touches[0].clientY })
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return dispatchRef.current({ type: 'cancel' })
      if (state.current.phase === 'idle' || state.current.phase === 'refreshing') return
      dispatchRef.current({ type: 'move', x: e.touches[0].clientX, y: e.touches[0].clientY })
    }
    const onEnd = () => dispatchRef.current({ type: 'end' })
    const onCancel = () => dispatchRef.current({ type: 'cancel' })

    const opts = { passive: true } as const
    document.addEventListener('touchstart', onStart, opts)
    document.addEventListener('touchmove', onMove, opts)
    document.addEventListener('touchend', onEnd, opts)
    document.addEventListener('touchcancel', onCancel, opts)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
      window.clearTimeout(leaveTimer.current)
    }
  }, [enabled, router])

  // The refresh is done: stay until the minimum spin has passed, then leave
  useEffect(() => {
    if (!refreshing || isPending) return
    const wait = spinRemaining(startedAt.current, performance.now())
    const timer = window.setTimeout(() => {
      if (chip.current) chip.current.dataset.leaving = ''
      leaveTimer.current = window.setTimeout(() => {
        setRefreshing(false)
        dispatchRef.current({ type: 'settled' })
        delete chip.current?.dataset.leaving
      }, MOTION.fast)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [refreshing, isPending])

  if (!enabled) return null
  return (
    <>
      <div ref={chip} aria-hidden className="pull-chip surface-overlay" data-phase="idle" style={{ '--pull': 0 } as React.CSSProperties}>
        <RefreshCw className="pull-chip__icon h-4 w-4" strokeWidth={2.25} />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {refreshing ? 'מרענן' : ''}
      </span>
    </>
  )
}
