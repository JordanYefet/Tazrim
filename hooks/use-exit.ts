'use client'

import { useEffect, useReducer, useRef } from 'react'
import { MOTION } from '@/lib/motion'

/**
 * Lets something that appears and goes with its data (a bar over the table while
 * rows are ticked) play an exit. `value` is what to show, or null for nothing:
 * once it turns null, the last value stays on screen with `leaving` true for
 * `ms`, then is gone. Under reduced motion it goes at once. The element keeps its
 * place in the layout throughout (nothing here moves anything), so a bar that
 * is sticky stays a direct child of where it sticks.
 */
export function useExit<T>(value: T | null, ms: number = MOTION.fast): { item: T | null; leaving: boolean } {
  const last = useRef<T | null>(value)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  if (value !== null) last.current = value

  const leaving = value === null && last.current !== null
  const instant = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!leaving) return
    if (instant) {
      last.current = null
      return
    }
    const timer = window.setTimeout(() => {
      last.current = null
      rerender()
    }, ms)
    return () => window.clearTimeout(timer)
  }, [leaving, instant, ms])

  return { item: instant ? value : (value ?? last.current), leaving: leaving && !instant }
}
