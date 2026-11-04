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
  it('lists every category as a chip, with the five that peak highest switched on (from the first full month)', () => {
    const html = renderToStaticMarkup(
      <SelectedMonthProvider>
        <ProjectionCategoryLines months={[month('2030-07', 0), month('2030-08', 0), month('2030-09', 4000)]} recurring={{ count: 3, monthly: 900 }} />
      </SelectedMonthProvider>
    )
    for (const name of names) expect(html).toContain(name)
    expect(html.match(/aria-pressed="true"/g)!.length).toBe(5)
    expect(html.match(/aria-pressed="false"/g)!.length).toBe(2)
    // the once-a-year peak is among the shown ones: it is the first chip
    expect(html.indexOf('תיירות')).toBeLessThan(html.indexOf('דיור'))
    expect(html).toContain('href="/recurring"')
  })
})
