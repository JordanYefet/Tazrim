'use client'

import { useEffect, useState } from 'react'
import { CHART_ANIMATION } from '@/lib/motion'

/**
 * Recharts animation props on the shared page beat (lib/motion.ts), and off
 * entirely under prefers-reduced-motion (Recharts does not check it itself).
 */
export function useChartAnimation() {
  // Read at once on the client, so a chart never starts animating before the preference is known
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return { ...CHART_ANIMATION, isAnimationActive: !reduce }
}
