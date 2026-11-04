'use client'

import { useEffect, useRef } from 'react'
import { MOTION } from '@/lib/motion'

/** How far the list peeks down (px), at most */
export const HINT_PX = 44

/**
 * The peek's path: down to `distance` and back to 0, eased in and out each way, as the
 * scroll position at progress t (0…1) of the whole motion.
 */
export function hintOffset(t: number, distance: number): number {
  const leg = t < 0.5 ? t * 2 : (1 - t) * 2
  const eased = leg < 0.5 ? 2 * leg * leg : 1 - (-2 * leg + 2) ** 2 / 2
  return Math.round(Math.max(0, Math.min(1, eased)) * distance)
}

/**
 * A list in a card of fixed height that scrolls (the accounts beside the wallet on /banks and
 * /cards). When it arrives and holds more than it shows, it peeks: scrolls down a little and
 * eases back, once, after the page lands, so it reads as scrollable. Not under reduced motion,
 * and never against the user: any wheel, touch or key on it stops the peek.
 */
export function ScrollHintList({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let stopped = false
    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    for (const e of events) el.addEventListener(e, stop, { passive: true })
    const start = window.setTimeout(() => {
      const distance = Math.min(HINT_PX, el.scrollHeight - el.clientHeight)
      if (stopped || distance < 8 || el.scrollTop > 0) return
      const duration = MOTION.base * 2 + MOTION.fast
      const t0 = performance.now()
      const step = (now: number) => {
        if (stopped) return
        const t = Math.min(1, (now - t0) / duration)
        el.scrollTop = hintOffset(t, distance)
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, MOTION.page)
    return () => {
      stop()
      window.clearTimeout(start)
      for (const e of events) el.removeEventListener(e, stop)
    }
  }, [])
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  )
}
