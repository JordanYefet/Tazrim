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

/** How the column mapper marks a row: the header, rows above it, skipped rows, rows with an error. */
export type GridRowTone = 'header' | 'above' | 'skipped' | 'error'

/**
 * Spreadsheet-like, read-only view of a RawWorkbookPreview.
 * RTL like Hebrew Excel: column A is on the right. The grid scrolls inside its
 * own box (both axes) so the page itself never scrolls sideways.
 *
 * The column mapper (ENG-23) passes `onPickRow` (row numbers become buttons
 * that mark the header row), `rowTone`, `columnTag` (the field a column is
 * mapped to), and controls the sheet with `activeSheet` / `onSheetChange`.
 */
export function RawGridPreview({
  workbook,
  className,
  activeSheet,
  onSheetChange,
  onPickRow,
  rowTone,
  columnTag,
  maxHeightClass = 'max-h-[65vh]',
}: {
  workbook: RawWorkbookPreview
  className?: string
  activeSheet?: number
  onSheetChange?: (index: number) => void
  onPickRow?: (row: number) => void
  rowTone?: (row: number) => GridRowTone | undefined
  columnTag?: (col: number) => string | undefined
  maxHeightClass?: string
}) {
  const [ownActive, setOwnActive] = useState(0)
  const active = activeSheet ?? ownActive
  const setActive = (i: number) => (onSheetChange ? onSheetChange(i) : setOwnActive(i))
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
          className={cn('relative w-fit max-w-full overflow-auto overscroll-contain rounded-lg border bg-card', maxHeightClass)}
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
                {columns.map(c => {
                  const tag = columnTag?.(c)
                  return (
                    <th
                      key={c}
                      scope="col"
                      className="sticky top-0 z-10 bg-muted border-b border-e px-2 py-1 text-xs font-medium text-muted-foreground text-center min-w-16 align-top"
                    >
                      {columnLabel(c)}
                      {tag && (
                        <span className="mt-0.5 block whitespace-nowrap rounded bg-primary/10 px-1 text-[11px] leading-4 text-primary">
                          {tag}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => {
                const tone = rowTone?.(r)
                return (
                  <tr
                    key={r}
                    className={cn(
                      'hover:[&>td]:bg-muted/40',
                      tone === 'header' && '[&>td]:bg-primary/10 [&>td]:font-medium hover:[&>td]:bg-primary/15',
                      (tone === 'skipped' || tone === 'above') && '[&>td]:text-muted-foreground/70',
                      tone === 'error' && '[&>td]:bg-destructive/5'
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        'sticky start-0 z-10 border-b border-e text-xs font-medium tabular-nums',
                        tone === 'header' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        tone === 'error' && 'text-destructive',
                        onPickRow ? 'p-0' : 'px-2 py-1 text-center'
                      )}
                    >
                      {onPickRow ? (
                        <button
                          type="button"
                          onClick={() => onPickRow(r)}
                          aria-pressed={tone === 'header'}
                          aria-label={`שורה ${r + 1}: סמן כשורת הכותרת`}
                          title="סמן כשורת הכותרת"
                          className={cn(
                            'flex min-h-7 w-full items-center justify-center px-2 transition-[background-color,transform] duration-150 ease-out',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95',
                            tone !== 'header' && 'hover:bg-primary/15 hover:text-foreground'
                          )}
                        >
                          {r + 1}
                        </button>
                      ) : (
                        r + 1
                      )}
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
                )
              })}
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
