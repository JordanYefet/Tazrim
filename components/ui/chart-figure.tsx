'use client'

import { usePrivacy } from '@/components/layout/privacy'

/**
 * A chart's frame (ENG-128): to assistive technology the chart is one image with a text
 * alternative (lib/a11y/chart-summary.ts), not a tangle of SVG groups and tooltips. The summary
 * holds amounts, so while privacy mode is on (ENG-127) it is left out and the label says why.
 * The wrapper keeps its own layout classes; it adds no box of its own.
 */
export function ChartFigure({
  label,
  summary,
  className,
  dir,
  children,
}: {
  label: string
  /** What the chart shows, in words (describeSeries, describeShares) */
  summary: string
  className?: string
  dir?: 'ltr'
  children: React.ReactNode
}) {
  const { on: hidden } = usePrivacy()
  return (
    <div role="img" aria-label={hidden ? `${label}. הסכומים מוסתרים` : `${label}. ${summary}`} dir={dir} className={className}>
      {children}
    </div>
  )
}
