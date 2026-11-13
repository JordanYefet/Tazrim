'use client'

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { EASE, MOTION } from '@/lib/motion'
import { SWAP_KEYFRAMES } from './use-data-swap'

/**
 * Rows that arrive on a table ("טען עוד") rise in with the same short fade a
 * swap plays (hooks/use-data-swap.ts), the new ones only: the rows already on
 * screen do not move. `rise(ids)` is called with the new rows' ids in the same
 * batch that adds them; before paint they are found by `data-row-id` inside
 * `ref`, on the phone list and the desktop table alike, and animated with WAAPI
 * (nothing remounts). Nothing under reduced motion.
 */
export function useRiseIn(ref: RefObject<HTMLElement | null>) {
  const pending = useRef<string[]>([])
  const [tick, setTick] = useState(0)

  useLayoutEffect(() => {
    const ids = pending.current
    pending.current = []
    const el = ref.current
    if (!ids.length || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const id of ids) {
      el.querySelectorAll<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`).forEach(row => {
        row.animate(SWAP_KEYFRAMES, { duration: MOTION.base, easing: EASE.ui })
      })
    }
  }, [ref, tick])

  return useCallback((ids: string[]) => {
    pending.current = ids
    setTick(n => n + 1)
  }, [])
}
