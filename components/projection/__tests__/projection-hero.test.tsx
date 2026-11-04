import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { ProjectionHero } from '../projection-hero'
import { SelectedMonthProvider } from '../selected-month'
import { monthLabel } from '@/lib/insights/projection-format'

// Made-up values only
const m = (month: string, expected: number, tight = false): ProjectedMonth => ({
  month, income: 10000, expense: 7000, net: 3000, expected, low: expected - 400, high: expected + 400, stale: false, tight,
})
const months = [m('2031-01', 8000), m('2031-02', 1500, true), m('2031-03', 4500)]
const render = (initial: string | null) =>
  renderToStaticMarkup(
    <SelectedMonthProvider initial={initial}>
      <ProjectionHero months={months} start={5000} end={months[2]} tight={[months[1]]} cushion={2000} />
    </SelectedMonthProvider>
  )

describe('ProjectionHero', () => {
  it('shows the 12-month view with nothing picked', () => {
    const html = render(null)
    expect(html).toContain('בעוד 12 חודשים')
    expect(html).toContain('היום')
    expect(html).not.toContain('נכנס בחודש')
  })

  it('follows the month picked on the chart: its balance, money in and out, and whether it is tight', () => {
    const html = render('2031-02')
    expect(html).toContain(`בסוף ${monthLabel('2031-02')}`)
    expect(html).toContain('נכנס בחודש')
    expect(html).toContain('יוצא בחודש')
    expect(html).toContain('צפוי להיות דחוק')
    expect(html).not.toContain('בעוד 12 חודשים')
  })
})
