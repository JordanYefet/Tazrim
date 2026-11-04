'use client'

import { X } from 'lucide-react'
import { CategoryDonut } from '@/components/cards/category-donut'
import { categoryColorMap } from '@/lib/utils/category-colors'
import { monthLabel } from '@/lib/insights/projection-format'
import type { ProjectedMonth, ProjectionCategory } from '@/lib/insights/projection'
import { useSelectedMonth } from './selected-month'

/**
 * Expected spending by category, as the app's category donut: a typical month, or the month
 * picked on the chart (with its season and the recurring charges that land in it).
 */
export function ProjectionCategories({ typical, months }: { typical: ProjectionCategory[]; months: ProjectedMonth[] }) {
  const { month, select } = useSelectedMonth()
  const picked = month ? months.find(m => m.month === month) : undefined
  const categories = picked?.categories ?? typical
  // One colour per category whichever month is shown: ranked by the typical month, then the rest
  const names = [...typical.map(c => c.name), ...months.flatMap(m => (m.categories ?? []).map(c => c.name))]
  const colors = categoryColorMap([...new Set(names)])
  return (
    <CategoryDonut
      pagePath="/projection"
      title={picked ? `הוצאות צפויות ב${monthLabel(picked.month)}` : 'הוצאות צפויות בחודש רגיל'}
      subtitle={picked ? 'כולל חיובים קבועים שנופלים בחודש הזה ואת העונה' : 'לחיצה על חודש בגרף מציגה את ההוצאות הצפויות בו'}
      data={Object.fromEntries(categories.map(c => [c.name, c.monthlyAmount]))}
      colors={colors}
      // The forecast has no transactions of its own to open: slices don't link
      categoryHrefs={{}}
      emptyText="אין הוצאות צפויות"
      headerAction={
        picked && (
          <button
            type="button"
            onClick={() => select(null)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            חודש רגיל
          </button>
        )
      }
    />
  )
}
