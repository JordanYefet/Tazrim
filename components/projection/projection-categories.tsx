'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { CategoryDonut } from '@/components/cards/category-donut'
import { categoryColorMap, OTHER_COLOR } from '@/lib/utils/category-colors'
import { monthLabel } from '@/lib/insights/projection-format'
import type { ProjectedMonth, ProjectionCategory } from '@/lib/insights/projection'
import { useSelectedMonth } from './selected-month'

const OTHER = 'אחר'
const SHOWN = 7

/** The SHOWN largest categories, and the rest added up as "אחר" (when there are more than one) */
export function topWithOther(categories: ProjectionCategory[]): ProjectionCategory[] {
  if (categories.length <= SHOWN + 1) return categories
  const rest = categories.slice(SHOWN).reduce((a, c) => a + c.monthlyAmount, 0)
  return [...categories.slice(0, SHOWN), { name: OTHER, monthlyAmount: Math.round(rest * 100) / 100 }]
}

/**
 * Expected spending by category, as the app's category donut: a typical month, or the month
 * picked on the chart (with its season and the recurring charges that land in it).
 */
export function ProjectionCategories({ typical, months, recurring }: {
  typical: ProjectionCategory[]
  months: ProjectedMonth[]
  /** the recurring charges in the forecast: how many, and their monthly total */
  recurring: { count: number; monthly: number }
}) {
  const { month, select } = useSelectedMonth()
  const picked = month ? months.find(m => m.month === month) : undefined
  // The largest few by name, the rest together as "אחר", so the legend stays short
  const categories = topWithOther(picked?.categories ?? typical)
  // One colour per category whichever month is shown: ranked by the typical month, then the rest
  const names = [...typical.map(c => c.name), ...months.flatMap(m => (m.categories ?? []).map(c => c.name))]
  const colors = { ...categoryColorMap([...new Set(names)]), [OTHER]: OTHER_COLOR }
  return (
    <CategoryDonut
      pagePath="/projection"
      title={picked ? `הוצאות צפויות ב${monthLabel(picked.month)}` : 'הוצאות צפויות בחודש רגיל'}
      subtitle={picked ? 'כולל חיובים קבועים שנופלים בחודש הזה ואת העונה' : 'לחיצה על חודש בגרף שלמטה מציגה את ההוצאות הצפויות בו'}
      data={Object.fromEntries(categories.map(c => [c.name, c.monthlyAmount]))}
      colors={colors}
      // The forecast has no transactions of its own to open: slices don't link
      categoryHrefs={{}}
      emptyText="אין הוצאות צפויות"
      footer={
        recurring.count > 0 && (
          <Link href="/recurring" className="mt-auto inline-block pt-4 text-sm text-primary hover:underline">
            {recurring.count} חיובים קבועים בתחזית, {formatCurrencyWhole(recurring.monthly)} בחודש. חיוב שהסתיים מסמנים בחיובים קבועים
          </Link>
        )
      }
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
