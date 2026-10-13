'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { columnLabel } from '@/lib/utils/column-label'
import type { RawCell, RawWorkbookPreview } from '@/lib/parsers/raw-grid'

const nf = new Intl.NumberFormat('he-IL')

function CellContent({ value }: { value: RawCell }) {
  if (value === null) return null
  if (typeof value === 'number') {
    return <span dir="ltr" className="tabular-nums">{String(value)}</span>
  }
  return <>{value}</>
}

/**
 * Spreadsheet-like, read-only view of a RawWorkbookPreview.
 * RTL like Hebrew Excel: column A is on the right. The grid scrolls inside its
 * own box (both axes) so the page itself never scrolls sideways.
 */
export function RawGridPreview({
  workbook,
  className,
}: {
  workbook: RawWorkbookPreview
  className?: string
}) {
  const [active, setActive] = useState(0)
  const sheet = workbook.sheets[Math.min(active, workbook.sheets.length - 1)]

  if (!sheet) {
    return <p className="text-sm text-muted-foreground">לא נמצאו גיליונות בקובץ</p>
  }

  const columns = Array.from({ length: sheet.columnCount }, (_, i) => i)

  return (
    <div className={cn('min-w-0 space-y-3', className)}>
      {workbook.sheets.length > 1 && (
        <div role="tablist" aria-label="גיליונות" className="flex gap-1 overflow-x-auto bg-muted rounded-lg p-1">
          {workbook.sheets.map((s, i) => (
            <button
              key={`${i}-${s.name}`}
              role="tab"
              type="button"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                'shrink-0 py-1.5 px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                i === active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span dir="auto">{s.name}</span>
              <span className="ms-1.5 text-xs text-muted-foreground tabular-nums">{nf.format(s.rowCount)}</span>
            </button>
          ))}
        </div>
      )}

      {sheet.rowCount === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          הגיליון ריק
        </div>
      ) : (
        <div
          className="relative w-fit max-h-[65vh] max-w-full overflow-auto overscroll-contain rounded-lg border bg-card"
          tabIndex={0}
          aria-label={`תצוגת גיליון ${sheet.name}`}
        >
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 start-0 z-20 min-w-10 bg-muted border-b border-e px-2 py-1 text-xs font-medium text-muted-foreground"
                >
                  <span className="sr-only">מספר שורה</span>
                </th>
                {columns.map(c => (
                  <th
                    key={c}
                    scope="col"
                    className="sticky top-0 z-10 bg-muted border-b border-e px-2 py-1 text-xs font-medium text-muted-foreground text-center min-w-16"
                  >
                    {columnLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className="hover:[&>td]:bg-muted/40">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 bg-muted border-b border-e px-2 py-1 text-xs font-medium text-muted-foreground text-center tabular-nums"
                  >
                    {r + 1}
                  </th>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      dir="auto"
                      title={cell === null ? undefined : String(cell)}
                      className={cn(
                        'border-b border-e px-2 py-1 whitespace-nowrap max-w-64 truncate text-start',
                        typeof cell === 'number' && 'text-end'
                      )}
                    >
                      <CellContent value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {nf.format(sheet.rowCount)} שורות · {nf.format(sheet.columnCount)} עמודות
        {sheet.omittedRowCount > 0 && (
          <> · מוצגות {nf.format(sheet.rows.length)} הראשונות ({nf.format(sheet.omittedRowCount)} נוספות לא מוצגות)</>
        )}
      </p>
    </div>
  )
}
