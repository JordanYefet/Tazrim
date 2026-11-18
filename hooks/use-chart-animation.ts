'use client'

import { useEffect, useState } from 'react'
import { CHART_ANIMATION } from '@/lib/motion'
import { prefersReducedMotion, subscribe as subscribeMedia } from '@/lib/a11y/media'

/**
 * Recharts animation props on the shared page beat (lib/motion.ts), and off
 * entirely under prefers-reduced-motion (Recharts does not check it itself).
 */
export function useChartAnimation() {
  // Read at once on the client, so a chart never starts animating before the preference is known
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && prefersReducedMotion()
  )
  useEffect(() => {
    const on = () => setReduce(prefersReducedMotion())
    on()
    return subscribeMedia('motion', on)
  }, [])
  return { ...CHART_ANIMATION, isAnimationActive: !reduce }
}
