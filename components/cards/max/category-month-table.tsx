import Link from 'next/link'
import { monthName, monthNameShort } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import type { CategoryMonthly } from '@/lib/insights/category-insights'

interface Props {
  monthly: CategoryMonthly
  /** Categories ordered by yearly spend */
  ranked: string[]
  colors: Record<string, string>
  /** Last month to show (latest month with card data) */
  lastMonth: number
  year: string
  selectedMonth?: number
  selectedCategory?: string
}

const fmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 })

export function CategoryMonthTable({ monthly, ranked, colors, lastMonth, year, selectedMonth, selectedCategory }: Props) {
  const months = Array.from({ length: lastMonth }, (_, i) => i + 1)
  const monthTotals = months.map(m => ranked.reduce((s, c) => s + (monthly[c]?.[m] ?? 0), 0))
  // Average over months that have any card data, so a missing upload doesn't drag it down
  const activeMonths = months.filter((_, i) => monthTotals[i] > 0).length || 1
  const grandTotal = monthTotals.reduce((s, v) => s + v, 0)

  const href = (update: Record<string, string | undefined>) => {
    const sp = new URLSearchParams({ year })
    if (selectedMonth) sp.set('month', String(selectedMonth))
    if (selectedCategory) sp.set('category', selectedCategory)
    for (const [k, v] of Object.entries(update)) {
      if (v === undefined) sp.delete(k)
      else sp.set(k, v)
    }
    return `/cards/max?${sp}`
  }

  const cell = 'px-3 py-2 text-end tabular-nums whitespace-nowrap'
  const stickyCol = 'sticky start-0 z-10 bg-card'
  const monthCol = (m: number) => selectedMonth === m && 'bg-primary/[0.07]'

  return (
    <section className="rounded-lg border bg-card">
      <div className="p-4 sm:p-5 pb-3">
        <h3 className="font-semibold text-base mb-0.5">פירוט לפי קטגוריה וחודש</h3>
        <p className="text-xs text-muted-foreground">
          סכומים בש״ח · ממוצע מחושב על {activeMonths} חודשים עם חיובים · לחץ על קטגוריה או חודש לסינון
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y text-xs text-muted-foreground">
              <th className={cn(stickyCol, 'px-3 py-2 text-start font-medium')}>קטגוריה</th>
              {months.map(m => (
                <th key={m} className={cn('p-0 font-medium', monthCol(m))}>
                  <Link
                    href={href({ month: selectedMonth === m ? undefined : String(m) })}
                    className={cn(
                      'block px-3 py-2 text-end hover:text-foreground',
                      selectedMonth === m && 'text-primary'
                    )}
                    title={monthName(m)}
                  >
                    {monthNameShort(m)}
                  </Link>
                </th>
              ))}
              <th className="px-3 py-2 text-end font-medium">סה״כ</th>
              <th className="px-3 py-2 text-end font-medium">ממוצע</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(c => {
              const values = months.map(m => monthly[c]?.[m] ?? 0)
              const total = values.reduce((s, v) => s + v, 0)
              const active = selectedCategory === c
              return (
                <tr
                  key={c}
                  className={cn(
                    'border-b last:border-b-0',
                    active && 'bg-primary/10',
                    selectedCategory && !active && 'text-muted-foreground'
                  )}
                >
                  <th scope="row" className={cn(stickyCol, 'p-0 font-normal', active && 'bg-primary/10')}>
                    <Link
                      href={href({ category: active ? undefined : c })}
                      className="flex max-w-[9.5rem] items-center gap-2 px-3 py-2 text-start hover:underline sm:max-w-none"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[c] }} aria-hidden />
                      <span className="truncate">{c}</span>
                    </Link>
                  </th>
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
            <tr className="border-t-2 font-semibold">
              <th scope="row" className={cn(stickyCol, 'px-3 py-2 text-start')}>סה״כ</th>
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
    </section>
  )
}
