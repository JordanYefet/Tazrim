'use client'

import { useSyncExternalStore } from 'react'
import { CHART_ANIMATION } from '@/lib/motion'
import { prefersReducedMotion, subscribe as subscribeMedia } from '@/lib/a11y/media'

/**
 * Recharts animation props on the shared page beat (lib/motion.ts), and off
 * entirely under prefers-reduced-motion (Recharts does not check it itself).
 */
export function useChartAnimation() {
  // Read at once on the client (the server renders as if motion is allowed, and hydration
  // uses that too, then corrects), live when the preference or the Settings switch changes
  const reduce = useSyncExternalStore(
    notify => subscribeMedia('motion', notify),
    prefersReducedMotion,
    () => false
  )
  return { ...CHART_ANIMATION, isAnimationActive: !reduce }
}
