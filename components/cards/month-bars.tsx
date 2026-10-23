import { cn } from '@/lib/utils/cn'
import { monthName } from '@/lib/utils/date'
import { monthBars } from '@/lib/insights/month-bars'

/**
 * A stat tile's mini chart: twelve thin bars, January to December (January on
 * the right: the page is RTL), the highlighted month darker, months after the
 * latest with data as faint stubs, and an optional dashed average line. Plain
 * divs, no chart library; it fills the height its tile leaves it.
 */
export function MonthBarsChart({
  values,
  selectedMonth,
  average,
  tone,
  caption,
  formatValue = v => String(v),
}: {
  /** month (1-12) -> value */
  values: Record<number, number>
  selectedMonth?: number
  /** Draws a dashed line at this value (the tile's own average, so the two agree) */
  average?: number
  /** 'neutral': grey bars; 'cc': the card colour */
  tone: 'neutral' | 'cc'
  caption: string
  /** For the screen-reader sentence */
  formatValue?: (value: number) => string
}) {
  const { bars, averageAt, highlightMonth } = monthBars(values, { selectedMonth, average })
  const highlighted = highlightMonth ? bars[highlightMonth - 1] : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-xs text-muted-foreground">{caption}</p>
      <div aria-hidden className="flex min-h-14 flex-1 flex-col gap-1">
        <div className="relative flex flex-1 items-end gap-[3px]">
          {bars.map(b => (
            <div
              key={b.month}
              className={cn(
                'min-w-0 flex-1 rounded-t-[2px] transition-[height,opacity] duration-fast ease-ui',
                b.future
                  ? cn('h-[3px]', b.highlight ? 'bg-muted-foreground/50' : 'bg-border')
                  : tone === 'neutral'
                    ? b.highlight ? 'bg-muted-foreground' : 'bg-muted-foreground/30'
                    : b.highlight ? 'opacity-100' : 'opacity-[0.35]'
              )}
              style={{
                ...(b.future
                  ? {}
                  : { height: b.value > 0 ? `max(2px, ${b.height * 100}%)` : b.highlight ? '2px' : '0' }),
                ...(tone === 'cc' && !b.future ? { backgroundColor: 'var(--chart-cc)' } : {}),
              }}
            />
          ))}
          {averageAt !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${averageAt * 100}%`, borderColor: 'var(--chart-cc)' }}
            />
          )}
        </div>
        <div className="flex h-3.5 gap-[3px] text-[10px] leading-none text-muted-foreground">
          {bars.map(b => (
            <div key={b.month} className="relative min-w-0 flex-1">
              {b.label && (
                <span
                  className={cn(
                    'absolute top-0 whitespace-nowrap',
                    b.highlight && 'font-medium text-foreground',
                    b.month === 1 ? 'start-0' : b.month === 12 ? 'end-0' : 'left-1/2 -translate-x-1/2'
                  )}
                >
                  {b.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">
        {caption}
        {highlighted && !highlighted.future && `: ${monthName(highlighted.month)} ${formatValue(highlighted.value)}`}
      </p>
    </div>
  )
}
