'use client'

import { useEffect, useState } from 'react'
import { MOTION } from '@/lib/motion'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Optional table columns that come and go with motion (the "עמודות" picker):
 * a column just added slides in and fades (.col-in), a column just removed
 * stays a moment to fade out (.col-out) before it leaves the table.
 *
 * `all` is every optional key in table order; `columns` the ones chosen.
 * Returns the keys to render (the chosen ones plus any still leaving) and the
 * class for a key's cells.
 */
export function useColumnMotion<T extends string>(all: readonly T[], columns: readonly T[]) {
  const [prev, setPrev] = useState(columns)
  const [entering, setEntering] = useState<readonly T[]>([])
  const [leaving, setLeaving] = useState<readonly T[]>([])

  // Adjusted during render, so the first frame with the new columns already has their classes
  if (columns !== prev) {
    setPrev(columns)
    if (!prefersReducedMotion()) {
      setEntering(columns.filter(k => !prev.includes(k)))
      setLeaving([...leaving.filter(k => !columns.includes(k)), ...prev.filter(k => !columns.includes(k))])
    }
  }

  // Each set clears once its motion is over (a newer change restarts the clock)
  useEffect(() => {
    if (!entering.length) return
    const t = window.setTimeout(() => setEntering([]), MOTION.base)
    return () => window.clearTimeout(t)
  }, [entering])
  useEffect(() => {
    if (!leaving.length) return
    const t = window.setTimeout(() => setLeaving([]), MOTION.fast)
    return () => window.clearTimeout(t)
  }, [leaving])

  const shown = all.filter(k => columns.includes(k) || leaving.includes(k))
  const cellClass = (key: T) => (leaving.includes(key) ? 'col-out' : entering.includes(key) ? 'col-in' : undefined)
  return { shown, cellClass }
}
