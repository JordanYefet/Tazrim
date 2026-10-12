'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

interface Props {
  data: Record<string, { total: number; count: number }>
  selectedCategory?: string
}

function CategoryExpensesTableInner({ data, selectedCategory }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  const rows = Object.entries(data)
    .map(([name, { total, count }]) => ({ name, total, count }))
    .sort((a, b) => b.total - a.total)

  const maxTotal = rows[0]?.total ?? 1

  function handleClick(name: string) {
    const sp = new URLSearchParams(params.toString())
    if (selectedCategory === name) {
      sp.delete('category')
    } else {
      sp.set('category', name)
    }
    router.push(`/cards/max?${sp.toString()}`)
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold text-base mb-0.5">פירוט לפי קטגוריה</h3>
      <p className="text-xs text-muted-foreground mb-4">לחץ לסינון</p>
      <div className="overflow-y-auto max-h-72 md:max-h-80 space-y-1">
        {rows.map(row => (
          <button
            key={row.name}
            onClick={() => handleClick(row.name)}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-start transition-colors',
              'hover:bg-muted group',
              selectedCategory && selectedCategory !== row.name && 'opacity-40'
            )}
          >
            <span className="flex-1 font-medium text-foreground">{row.name}</span>
            <span className="text-xs text-muted-foreground w-8 text-center">{row.count}</span>
            {/* Mini bar */}
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[hsl(var(--expense))] rounded-full opacity-70"
                style={{ width: `${(row.total / maxTotal) * 100}%` }}
              />
            </div>
            <span className="text-[hsl(var(--expense))] font-semibold tabular-nums text-xs w-24 text-end">
              {formatCurrency(row.total)}
            </span>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="text-center py-6 text-muted-foreground text-sm">אין נתונים</p>
        )}
      </div>
    </div>
  )
}

export function CategoryExpensesTable(props: Props) {
  return (
    <Suspense fallback={<div className="rounded-lg border bg-card p-5 h-48" />}>
      <CategoryExpensesTableInner {...props} />
    </Suspense>
  )
}
