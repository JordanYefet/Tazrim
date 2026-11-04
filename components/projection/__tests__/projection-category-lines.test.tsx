import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { ProjectionCategoryLines } from '../projection-category-lines'
import { SelectedMonthProvider } from '../selected-month'

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

// Made-up values only: seven categories, one of them a once-a-year peak
const names = ['דיור', 'מזון', 'חשבונות', 'תחבורה', 'פנאי', 'בריאות', 'תיירות']
const month = (m: string, trip: number): ProjectedMonth => ({
  month: m, income: 0, expense: 0, net: 0, expected: 0, low: 0, high: 0, stale: false, tight: false,
  categories: names.map((name, i) => ({ name, monthlyAmount: name === 'תיירות' ? trip : 3000 - i * 400 })),
})

describe('ProjectionCategoryLines', () => {
  it('shows the five that peak highest at first, in the legend, with the picker counting them', () => {
    const html = renderToStaticMarkup(
      <SelectedMonthProvider>
        <ProjectionCategoryLines actual={[]} months={[month('2030-07', 0), month('2030-08', 0), month('2030-09', 4000)]} recurring={{ count: 3, monthly: 900 }} />
      </SelectedMonthProvider>
    )
    const legend = html.slice(html.indexOf('aria-label="קטגוריות בגרף"'))
    // the once-a-year peak is among the shown ones; the two smallest are left for the picker
    for (const name of ['תיירות', 'דיור', 'מזון', 'חשבונות', 'תחבורה']) expect(legend).toContain(name)
    for (const name of ['פנאי', 'בריאות']) expect(legend).not.toContain(name)
    expect(html).toContain('קטגוריות')
    expect(html).toContain('(5)')
    expect(html).toContain('href="/recurring"')
  })
})
