'use client'

import { useEffect, useState } from 'react'
import { useChartAnimation } from '@/hooks/use-chart-animation'

/**
 * Recharts animation props that play the entrance once: after it lands they turn animation
 * off, as Recharts restarts it whenever a chart's children change (a picked month's highlight,
 * a category switched on or off).
 */
export function useEntranceOnce() {
  const entrance = useChartAnimation()
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setLanded(true), entrance.animationBegin + entrance.animationDuration + 50)
    return () => window.clearTimeout(t)
  }, [entrance.animationBegin, entrance.animationDuration])
  return landed ? { ...entrance, isAnimationActive: false } : entrance
}
