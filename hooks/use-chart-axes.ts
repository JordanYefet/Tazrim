'use client'

import { useEffect, useState } from 'react'
import { monthName, monthNameShort } from '@/lib/utils/date'
import { showMonthLabel } from '@/lib/insights/chart-months'

const FULL_NAMES = Array.from({ length: 12 }, (_, i) => monthName(i + 1))

const SMALL_QUERY = '(max-width: 639px)'

function useIsSmallScreen() {
  const [small, setSmall] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(SMALL_QUERY)
    setSmall(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setSmall(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return small
}

/** ₪140k / 140k (compact drops the symbol to save width on phones) */
export function formatAxisCurrency(value: number, compact = false): string {
  const abs = Math.abs(value)
  const body = abs >= 1000 ? `${Math.round(abs / 1000)}k` : String(Math.round(abs))
  return `${value < 0 ? '-' : ''}${compact ? '' : '₪'}${body}`
}

/**
 * Shared spacing for every Recharts cartesian chart, so axes keep a gap from
 * the plot and stay readable on phones. Spread `xAxis` / `yAxis` onto the axes.
 */
export function useChartAxes(textColor: string) {
  const small = useIsSmallScreen()
  // No fontFamily: tick text inherits the page's self-hosted Heebo (font-sans)
  const tick = { fontSize: small ? 10 : 11, fill: textColor }

  return {
    small,
    margin: { top: 8, right: small ? 4 : 8, left: 0, bottom: 0 },
    xAxis: {
      tick,
      tickMargin: 10,
      axisLine: false,
      tickLine: false,
    },
    yAxis: {
      tick,
      tickMargin: 8,
      width: small ? 38 : 56,
      tickCount: small ? 4 : 5,
      axisLine: false,
      tickLine: false,
      tickFormatter: (v: number) => formatAxisCurrency(v, small),
    },
    /**
     * X-axis props for a January-December chart (ENG-70): short names, and on
     * phones every other month, but always the selected one (its neighbours
     * give way so the labels don't touch).
     */
    monthAxis: (count: number, selectedMonth?: number) => ({
      interval: 0,
      tickFormatter: (name: string, index: number) => {
        if (!showMonthLabel(index + 1, selectedMonth, small && count > 6)) return ''
        const i = FULL_NAMES.indexOf(name)
        return small && i >= 0 ? monthNameShort(i + 1) : name
      },
    }),
  }
}
