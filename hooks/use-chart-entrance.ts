'use client'

import { useState } from 'react'
import { useChartAnimation } from '@/hooks/use-chart-animation'

/**
 * A chart's entrance in CSS, its later data changes in Recharts.
 *
 * Recharts animates by re-rendering the whole chart on every frame. On a page
 * that arrives with a moving card wallet (a card switch on /cards and /banks)
 * two charts doing that at once kept the main thread full and the page
 * stuttered on phones. So the entrance (bars growing, the ring sweeping in)
 * is a CSS animation on the static chart (`entering`: the wrapper's
 * .chart-entrance-* class, app/globals.css), with the same duration and
 * easing as before. Recharts' own animation turns on with the first data
 * change, in the same render, so that change still tweens from the old values
 * (turned on earlier, Recharts would replay the entrance from zero).
 *
 * `dataKey`: a string that changes when the chart's data does.
 */
export function useChartEntrance(dataKey: string) {
  const anim = useChartAnimation()
  const [mountKey] = useState(dataKey)
  const [changed, setChanged] = useState(false)
  // Latched during render, so the new data and the animation arrive together
  if (!changed && dataKey !== mountKey) setChanged(true)
  const updating = changed || dataKey !== mountKey
  return {
    recharts: { ...anim, isAnimationActive: anim.isAnimationActive && updating },
    entering: anim.isAnimationActive && !updating,
  }
}
