import { PeriodLink } from '@/components/layout/period-link'
import { cn } from '@/lib/utils/cn'
import { monthName } from '@/lib/utils/date'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { monthBars } from '@/lib/insights/month-bars'

/**
 * A category's twelve months (January on the left, as on every chart): plain divs in
 * the category's colour, the selected month outlined, the month in progress lighter
 * (its figure is partial), months after the latest data as faint stubs. Every column
 * is a link that selects its month (the selected one links back to the whole year),
 * the full chart height tall. Heights come from lib/insights/month-bars.ts.
 */
export function CategoryYearBars({
  values,
  selectedMonth,
  inProgressMonth,
  color,
  href,
  className,
}: {
  /** month (1-12) -> the category's total */
  values: Record<number, number>
  selectedMonth?: number
  /** This month, when it is in the year shown */
  inProgressMonth?: number
  /** The category's colour (a CSS var) */
  color: string
  /** Where a month opens; `undefined` = the whole year */
  href: (month: number | undefined) => string
  className?: string
}) {
  const { bars } = monthBars(values, { selectedMonth })
  return (
    // The space between the bars is inside the links (padding, not a gap), so a touch
    // between two months lands on one of them; the negative margin keeps the bars where
    // a gap would have put them
    <div dir="ltr" className={cn('-mx-0.5 flex h-36 items-stretch sm:-mx-[3px]', className)}>
      {bars.map(b => {
        const selected = b.month === selectedMonth
        // The whole year: every bar the same, so it can't be mistaken for a picked month
        const lit = !!selectedMonth && b.highlight
        const inProgress = !!selectedMonth && b.month === inProgressMonth
        const label = `${monthName(b.month)}: ${b.future ? 'אין נתונים' : formatCurrencyWhole(b.value)}`
        return (
          <PeriodLink
            key={b.month}
            href={href(selected ? undefined : b.month)}
            scroll={false}
            aria-label={selected ? `${label} (נבחר; לחיצה מציגה את כל השנה)` : label}
            aria-current={selected ? 'true' : undefined}
            className="group flex min-w-0 flex-1 flex-col justify-end gap-1.5 rounded-md px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-[3px]"
          >
            <span className="flex min-h-0 flex-1 flex-col justify-end">
              <span
                aria-hidden
                className={cn(
                  'block w-full rounded-t-[3px] transition-[height,opacity] duration-page ease-ui motion-reduce:transition-none',
                  b.future && 'h-[3px] bg-border',
                  !b.future && !lit && !inProgress && 'opacity-60 group-hover:opacity-80',
                  !b.future && inProgress && !lit && 'opacity-35',
                  selected && 'outline outline-2 outline-offset-1 outline-foreground'
                )}
                style={
                  b.future
                    ? undefined
                    : { backgroundColor: color, height: b.value > 0 ? `max(3px, ${b.height * 100}%)` : '3px' }
                }
              />
            </span>
            <span
              className={cn(
                'block truncate text-center text-[10px] leading-none text-muted-foreground',
                lit && 'font-medium text-foreground'
              )}
              aria-hidden
            >
              {monthName(b.month)}
            </span>
          </PeriodLink>
        )
      })}
    </div>
  )
}
