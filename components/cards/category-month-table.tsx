import Link from 'next/link'
import { monthName, monthNameShort } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import { DataSwap } from '@/components/ui/data-swap'
import type { CategoryMonthly } from '@/lib/insights/category-insights'

interface Props {
  /** Page a month click filters (the category page itself) */
  basePath: string
  /** Where each category goes: its transactions (a category without one is plain text) */
  categoryHrefs: Record<string, string | undefined>
  monthly: CategoryMonthly
  /** Categories ordered by yearly spend */
  ranked: string[]
  colors: Record<string, string>
  /** Last month to show (latest month with card data) */
  lastMonth: number
  year: string
  selectedMonth?: number
  /** What a month "with data" holds, for the average's note */
  unit?: string
}

const fmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 })

export function CategoryMonthTable({
  basePath,
  categoryHrefs,
  monthly,
  ranked,
  colors,
  lastMonth,
  year,
  selectedMonth,
  unit = 'חיובים',
}: Props) {
  const months = Array.from({ length: lastMonth }, (_, i) => i + 1)
  const monthTotals = months.map(m => ranked.reduce((s, c) => s + (monthly[c]?.[m] ?? 0), 0))
  // Average over months that have any card data, so a missing upload doesn't drag it down
  const activeMonths = months.filter((_, i) => monthTotals[i] > 0).length || 1
  const grandTotal = monthTotals.reduce((s, v) => s + v, 0)

  // A month header toggles the month on this page
  const monthHref = (m: number) => {
    const sp = new URLSearchParams({ year })
    if (selectedMonth !== m) sp.set('month', String(m))
    return `${basePath}?${sp}`
  }

  // Every row the same height in both tables below, so the name column lines up with the numbers
  const cell = 'h-9 px-3 py-0 text-end tabular-nums whitespace-nowrap'
  const nameCell = 'h-9 p-0 text-start font-normal'
  const monthCol = (m: number) => selectedMonth === m && 'bg-primary/[0.07]'
  // Row lines as inset shadows, not borders: they take no height, so both tables' rows stay 36px exactly
  const headRow = '[&>*]:shadow-[inset_0_1px_0_hsl(var(--border)),inset_0_-1px_0_hsl(var(--border))]'
  const bodyRow = '[&>*]:shadow-[inset_0_-1px_0_hsl(var(--border))] last:[&>*]:shadow-none'
  const footRow = '[&>*]:shadow-[inset_0_2px_0_hsl(var(--border))]'
  const dot = (c: string) => (
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[c] }} aria-hidden />
  )

  // Another year swaps every row, so the table eases in; a month only moves the highlighted column.
  // The category names are a column of their own beside the scroller, not a sticky column inside
  // it: iOS Safari misplaces sticky cells in a right-to-left sideways scroller while the page
  // scrolls (the names blank out until it settles). The names table is presentational; the
  // numbers table carries each row's name for screen readers.
  return (
    <DataSwap as="section" swapKey={year} height className="rounded-xl surface">
      <div className="p-4 pb-3 sm:p-6 sm:pb-4">
        <h3 className="text-base font-semibold">פירוט לפי קטגוריה וחודש</h3>
        <p className="text-sm text-muted-foreground">
          סכומים בש״ח · ממוצע מחושב על {activeMonths} חודשים עם {unit} · חודש מסנן, קטגוריה פותחת את העסקאות שלה
        </p>
      </div>

      <div className="flex">
        <table role="presentation" className="shrink-0 border-separate border-spacing-0 text-sm">
          <thead>
            <tr className={cn(headRow, 'text-xs text-muted-foreground')}>
              <th className={cn(nameCell, 'px-3 font-medium')} aria-hidden>
                קטגוריה
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(c => (
              <tr key={c} className={bodyRow}>
                <td className={nameCell}>
                  {categoryHrefs[c] ? (
                    <Link
                      href={categoryHrefs[c]}
                      className="flex h-9 max-w-[9.5rem] items-center gap-2 px-3 text-start hover:underline sm:max-w-none"
                    >
                      {dot(c)}
                      <span className="truncate">{c}</span>
                    </Link>
                  ) : (
                    <span className="flex h-9 max-w-[9.5rem] items-center gap-2 px-3 text-start sm:max-w-none" aria-hidden>
                      {dot(c)}
                      <span className="truncate">{c}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={cn(footRow, 'font-semibold')}>
              <td className={cn(nameCell, 'px-3 font-semibold')} aria-hidden>
                סה״כ
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className={cn(headRow, 'text-xs text-muted-foreground')}>
                <th className="sr-only">קטגוריה</th>
                {months.map(m => (
                  <th key={m} className={cn('h-9 p-0 font-medium', monthCol(m))}>
                    <Link
                      href={monthHref(m)}
                      scroll={false}
                      className={cn(
                        'flex h-9 items-center justify-end px-3 hover:text-foreground',
                        selectedMonth === m && 'text-primary'
                      )}
                      title={monthName(m)}
                    >
                      {monthNameShort(m)}
                    </Link>
                  </th>
                ))}
                <th className={cn(cell, 'font-medium')}>סה״כ</th>
                <th className={cn(cell, 'font-medium')}>ממוצע</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(c => {
                const values = months.map(m => monthly[c]?.[m] ?? 0)
                const total = values.reduce((s, v) => s + v, 0)
                return (
                  <tr key={c} className={bodyRow}>
                    <th scope="row" className="sr-only">{c}</th>
                    {values.map((v, i) => (
                      <td key={i} className={cn(cell, monthCol(months[i]), v === 0 && 'text-muted-foreground/50')}>
                        {v === 0 ? '–' : fmt.format(v)}
                      </td>
                    ))}
                    <td className={cn(cell, 'font-semibold')}>{fmt.format(total)}</td>
                    <td className={cn(cell, 'text-muted-foreground')}>{fmt.format(total / activeMonths)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className={cn(footRow, 'font-semibold')}>
                <th scope="row" className="sr-only">סה״כ</th>
                {monthTotals.map((v, i) => (
                  <td key={i} className={cn(cell, monthCol(months[i]))}>
                    {v === 0 ? '–' : fmt.format(v)}
                  </td>
                ))}
                <td className={cell}>{fmt.format(grandTotal)}</td>
                <td className={cn(cell, 'text-muted-foreground')}>{fmt.format(grandTotal / activeMonths)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </DataSwap>
  )
}
