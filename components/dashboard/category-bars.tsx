import Link from 'next/link'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'
import { RollingNumber } from '@/components/ui/rolling-number'
import { OTHER_COLOR } from '@/lib/utils/category-colors'
import { groupCategoryBars } from '@/lib/insights/category-bars'

const GROW = 'transition-[width] duration-page ease-ui motion-reduce:transition-none'

/**
 * The overview's categories: the list is the chart. A thin strip of the period's shares on
 * top, then a row per category with its amount and a bar relative to the largest one.
 * Rows, order and colours follow the YEAR's ranking, so picking a month only moves the
 * bars and amounts (a category with nothing keeps its row at ₪0). Rows are keyed by
 * category and nothing remounts, so the width transitions run on a month change.
 */
export function CategoryBars({
  title,
  subtitle,
  ranked,
  amounts,
  colors,
  hrefs,
  emptyText = 'אין חיובים לשנה זו',
}: {
  title: string
  subtitle?: string
  /** Every category, ranked by the year's spend */
  ranked: string[]
  /** The selected period's spend per category */
  amounts: Record<string, number>
  colors: Record<string, string>
  /** Where each category opens its transactions; "אחר" has no link */
  hrefs: Record<string, string>
  emptyText?: string
}) {
  const { rows, total, max } = groupCategoryBars(ranked, amounts)
  const colorOf = (key: string, other: boolean) => (other ? OTHER_COLOR : (colors[key] ?? OTHER_COLOR))

  return (
    <section className={`${SECTION} flex flex-col`}>
      <ChartHeader title={title} subtitle={subtitle} className="mb-4" />
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          {/* The shares as one strip. Each segment's wrapper grows in width; the inner bar keeps
              a 1px margin each side, so the gaps close with a segment that has nothing */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" dir="ltr" aria-hidden>
            {rows.map(r => (
              <div
                key={r.key}
                className={`h-full shrink-0 overflow-hidden ${GROW}`}
                style={{ width: total > 0 ? `${(r.amount / total) * 100}%` : '0%' }}
              >
                <div className="mx-px h-full rounded-full" style={{ backgroundColor: colorOf(r.key, r.other) }} />
              </div>
            ))}
          </div>

          <ul className="mt-2 flex flex-col">
            {rows.map(r => {
              const href = hrefs[r.key]
              const body = (
                <>
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{r.label}</span>
                    <RollingNumber
                      value={r.amount}
                      format="currency"
                      className={`shrink-0 whitespace-nowrap text-end font-medium tabular-nums transition-colors duration-page ease-ui ${
                        r.amount > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                      }`}
                    />
                  </span>
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted" dir="ltr" aria-hidden>
                    <span
                      className={`block h-full rounded-full ${GROW}`}
                      style={{
                        width: max > 0 ? `${(r.amount / max) * 100}%` : '0%',
                        backgroundColor: colorOf(r.key, r.other),
                      }}
                    />
                  </span>
                </>
              )
              const cls = 'flex min-h-11 flex-col justify-center rounded-md px-1.5 py-2'
              return (
                <li key={r.key}>
                  {href ? (
                    <Link href={href} className={`${cls} transition-colors hover:bg-muted/60`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
