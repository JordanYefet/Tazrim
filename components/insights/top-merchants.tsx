'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { RollingNumber } from '@/components/ui/rolling-number'
import { MerchantYear } from '@/components/transactions/merchant-year'
import { toSearchParams } from '@/lib/search/query'
import type { MerchantSummary } from '@/lib/insights/category-year'

/**
 * "העסקים הגדולים השנה": the category's merchants as rows (name, how many rows, the
 * year's total). A row opens the merchant's window: its twelve months and a way to
 * every one of its transactions (search). Rows are 56px, edge to edge in the card.
 */
export function TopMerchants({ merchants, year, title = 'העסקים הגדולים השנה', emptyText }: {
  merchants: MerchantSummary[]
  year: number
  title?: string
  emptyText: string
}) {
  const [picked, setPicked] = useState<MerchantSummary | null>(null)
  // The last one stays while the window animates out
  const [last, setLast] = useState<MerchantSummary | null>(null)
  if (picked && picked !== last) setLast(picked)
  const shown = picked ?? last

  return (
    <section className="flex flex-col rounded-xl surface">
      <h3 className="px-4 pt-4 text-base font-semibold sm:px-6 sm:pt-6">{title}</h3>
      {merchants.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border/60">
          {merchants.map(m => (
            <li key={`${m.sample.source}:${m.name}`}>
              <button
                type="button"
                onClick={() => setPicked(m)}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-start transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <bdi className="block truncate text-sm font-medium">{m.name}</bdi>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {m.count === 1 ? 'עסקה אחת' : `${m.count} עסקאות`}
                  </span>
                </span>
                <RollingNumber value={m.total} format="currency" className="shrink-0 text-sm font-semibold" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AppDialog
        open={!!picked}
        onOpenChange={o => !o && setPicked(null)}
        title={
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-normal text-muted-foreground">
              {shown ? (shown.count === 1 ? 'עסקה אחת' : `${shown.count} עסקאות`) : ''} · {year}
            </span>
            <bdi>{shown?.name ?? ''}</bdi>
          </span>
        }
      >
        {picked && shown && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl ring-1 ring-inset ring-border px-3.5 py-3.5">
              <MerchantYear key={shown.sample.id} source={shown.sample.source} id={shown.sample.id} year={year} />
            </div>
            <Link
              href={`/search?${toSearchParams({ text: `"${shown.name}"`, from: `${year}-01-01`, to: `${year}-12-31` })}`}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm transition-[background-color,transform] duration-quick ease-ui hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="h-4 w-4" aria-hidden />
              כל העסקאות בחיפוש
            </Link>
          </div>
        )}
      </AppDialog>
    </section>
  )
}
