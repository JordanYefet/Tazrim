'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneTransactionRows } from '@/components/transactions/phone-rows'
import { SearchResultList } from '@/components/search/search-result-list'
import { CategoryPill } from '@/components/categories/category-picker'
import { ResultCategoryWindow, type PickerData } from '@/components/transactions/result-category-window'
import { RollingNumber } from '@/components/ui/rolling-number'
import type { SearchResult } from '@/lib/search/query'

const NONE: ReadonlySet<string> = new Set()
const never = () => false
const noop = () => {}

/**
 * One month's rows of a category, bank and cards together: the phone rows below `md`
 * (no tick boxes: there is nothing to apply in bulk here) and the search result rows
 * from `md` up, each linking to its account's table. Tapping a phone row opens its
 * window (the category picker with the merchant's year); a saved category refreshes
 * the page, so the row leaves the list and the figures follow.
 */
export function CategoryMonthList({ rows, title, total, picker, emptyText }: {
  rows: SearchResult[]
  title: string
  /** The month's total in the category */
  total: number
  picker: PickerData
  emptyText: string
}) {
  const router = useRouter()
  const [picking, setPicking] = useState<SearchResult | null>(null)
  const colorOf = (r: SearchResult) => (r.category ? picker.colors[r.category] : undefined)
  const yours = new Set([...picker.expense, ...picker.income])
  const known = (category?: string) => (category && yours.has(category) ? category : null)

  return (
    <section className="flex flex-col rounded-xl surface">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <h3 className="min-w-0 truncate text-base font-semibold">{title}</h3>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {rows.length === 0 ? '' : rows.length === 1 ? 'תנועה אחת' : `${rows.length} תנועות`}
          {rows.length > 0 && ' · '}
          <RollingNumber value={total} format="currency" className={rows.length === 0 ? 'text-muted-foreground/50' : undefined} />
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="mt-2">
          <PhoneTransactionRows
            rows={rows}
            selected={NONE}
            canSelect={never}
            onToggle={noop}
            onOpen={setPicking}
            showAccount
            selectable={false}
            categoryColor={colorOf}
          />
          <div className="hidden px-2 pb-2 md:block">
            <SearchResultList
              results={rows}
              terms={[]}
              hideIcon
              categoryInActions
              actions={r =>
                r.ignored ? null : (
                  <CategoryPill
                    name={known(r.category)}
                    color={known(r.category) ? picker.colors[r.category!] : undefined}
                    sourceName={known(r.category) ? undefined : r.category}
                    onClick={() => setPicking(r)}
                  />
                )
              }
            />
          </div>
        </div>
      )}
      <ResultCategoryWindow
        result={picking}
        picker={picker}
        onClose={() => setPicking(null)}
        // The figures on the page change with the row's category, so the page is read again
        onApplied={() => router.refresh()}
      />
    </section>
  )
}
