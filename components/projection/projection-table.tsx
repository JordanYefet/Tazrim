import { formatCurrencyWhole } from '@/lib/utils/currency'
import { monthLabel } from '@/lib/insights/projection-format'
import { SECTION, ChartHeader } from '@/components/accounts/page-parts'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { cn } from '@/lib/utils/cn'

/** One row per month; the tight label's cell is there on every row (stable layout) */
export function ProjectionTable({ months }: { months: ProjectedMonth[] }) {
  return (
    <section className={SECTION}>
      <ChartHeader title="חודש אחר חודש" subtitle="הכנסות, הוצאות ויתרה צפויה בסוף כל חודש" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-start font-medium">חודש</th>
              <th className="py-2 text-end font-medium">נכנס</th>
              <th className="py-2 text-end font-medium">יוצא</th>
              <th className="py-2 text-end font-medium">יתרה צפויה</th>
              <th className="w-16 py-2"><span className="sr-only">מצב</span></th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m.month} className={cn('border-t border-border', m.stale && 'text-muted-foreground')}>
                <td className="py-2.5">{monthLabel(m.month)}</td>
                <td className="py-2.5 text-end text-[hsl(var(--income))]">{formatCurrencyWhole(m.income)}</td>
                <td className="py-2.5 text-end">{formatCurrencyWhole(m.expense)}</td>
                <td className="py-2.5 text-end">
                  <span className="block font-medium text-foreground">{formatCurrencyWhole(m.expected)}</span>
                  <span className="block text-xs text-muted-foreground">עד {formatCurrencyWhole(m.low)}</span>
                </td>
                <td className="py-2.5 text-end">
                  <span className={cn('rounded-md bg-[hsl(var(--expense)/0.12)] px-2 py-0.5 text-xs font-medium text-[hsl(var(--expense))]', !m.tight && 'invisible')}>
                    דחוק
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
