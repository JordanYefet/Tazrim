'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import type { SkippedRow } from '@/lib/upload/import'

const day = (iso: string) => iso.split('-').reverse().join('.')

/**
 * The file rows an import skipped because the account already has them, with
 * what they matched. On card accounts the user can tick rows and import them
 * anyway (two real charges that look alike); bank rows can only be reviewed.
 */
export function SkippedRows({
  rows,
  canForce,
  busy,
  onForce,
  defaultOpen = true,
}: {
  rows: SkippedRow[]
  canForce: boolean
  busy: boolean
  onForce: (indexes: number[]) => void
  /** Several files' lists on one page start closed */
  defaultOpen?: boolean
}) {
  const titleId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  if (!rows.length) return null

  const toggle = (index: number) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  const allPicked = picked.size === rows.length

  return (
    <section aria-labelledby={titleId} className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <span id={titleId} className="font-medium">
          {rows.length === 1 ? 'שורה אחת דולגה' : `${rows.length} שורות דולגו`} כי הן כבר קיימות בחשבון
        </span>
        <ChevronDown className={cn('ms-auto h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="border-t">
          <p className="px-3 pt-2.5 text-xs text-muted-foreground">
            {canForce
              ? 'אותו תאריך, בית עסק, סכום, תאריך חיוב ותשלום כמו עסקה שכבר נשמרה. אם אלו עסקאות נפרדות באמת, סמנו אותן וייבאו בכל זאת.'
              : 'אותו תאריך, תיאור וסכום כמו תנועה שכבר נשמרה.'}
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b">
                  {canForce && (
                    <th scope="col" className="w-8 px-2 py-2 sm:w-11 sm:px-3">
                      <input
                        type="checkbox"
                        aria-label="סמן הכל"
                        checked={allPicked}
                        onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.index)))}
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                      />
                    </th>
                  )}
                  <th scope="col" className="w-[5.75rem] px-2 py-2 text-start font-medium sm:w-28 sm:px-3">תאריך</th>
                  <th scope="col" className="px-2 py-2 text-start font-medium sm:px-3">תיאור</th>
                  <th scope="col" className="hidden w-56 px-3 py-2 text-start font-medium sm:table-cell">קיים מקובץ</th>
                  <th scope="col" className="w-[5.75rem] px-2 py-2 text-end font-medium sm:w-28 sm:px-3">סכום</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.index} className="border-b last:border-0 align-top">
                    {canForce && (
                      <td className="px-2 py-2 sm:px-3">
                        <input
                          type="checkbox"
                          aria-label={`ייבא בכל זאת: ${r.description}, ${day(r.date)}`}
                          checked={picked.has(r.index)}
                          onChange={() => toggle(r.index)}
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground sm:px-3">{day(r.date)}</td>
                    <td className="min-w-0 px-2 py-2 sm:px-3">
                      <span className="block break-words" dir="auto">{r.description}</span>
                      {(r.notes || r.billingDate) && (
                        <span className="block text-xs text-muted-foreground" dir="auto">
                          {[r.notes, r.billingDate && `חיוב ${day(r.billingDate)}`].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <span className="block truncate text-xs text-muted-foreground sm:hidden" dir="auto" title={r.matchedFile}>
                        קיים מ־{r.matchedFile || 'ייבוא קודם'}
                      </span>
                    </td>
                    <td className="hidden truncate px-3 py-2 text-xs text-muted-foreground sm:table-cell" dir="auto" title={r.matchedFile}>
                      {r.matchedFile || 'ייבוא קודם'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-end tabular-nums sm:px-3">{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canForce && (
            <div className="flex items-center gap-3 border-t px-3 py-2.5">
              <button
                type="button"
                onClick={() => onForce([...picked])}
                disabled={!picked.size || busy}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? 'מייבא...' : picked.size ? `ייבא בכל זאת (${picked.size})` : 'ייבא בכל זאת'}
              </button>
              <span className="text-xs text-muted-foreground">השאר לא יובאו.</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
