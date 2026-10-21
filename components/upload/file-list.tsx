'use client'

import { AlertCircle, CheckCircle2, FileSpreadsheet, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { BatchFile } from '@/lib/upload/batch'
import type { RawFormat, RawWorkbookPreview } from '@/lib/parsers/raw-grid'

export const FORMAT_LABEL: Record<RawFormat, string> = {
  xlsx: 'Excel (xlsx)',
  xls: 'Excel (xls)',
  'xls-html': 'HTML בתור xls',
  csv: 'CSV',
}

const nf = new Intl.NumberFormat('he-IL')

/** "Excel (xlsx) · 34 שורות", or the sheet count for a workbook with several. */
export function previewSummary(preview: RawWorkbookPreview): string {
  const size =
    preview.sheets.length > 1
      ? `${preview.sheets.length} גיליונות`
      : `${nf.format(preview.sheets[0]?.rowCount ?? 0)} שורות`
  return `${FORMAT_LABEL[preview.format]} · ${size}`
}

/** "5 חדשות · 2 דולגו" (or "חדשה אחת"); the skipped part only when there are some, unless `always`. */
export function resultCounts(created: number, skipped: number, always = true): string {
  const c = created === 1 ? 'חדשה אחת' : `${nf.format(created)} חדשות`
  if (!skipped && !always) return c
  return `${c} · ${skipped === 1 ? 'אחת דולגה' : `${nf.format(skipped)} דולגו`}`
}

type Tone ='muted' | 'busy' | 'ok' | 'bad'

function status(x: BatchFile<File, RawWorkbookPreview>, readyLabel?: string): { label: string; detail?: string; tone: Tone } {
  if (x.import === 'importing') return { label: 'מייבא', tone: 'busy' }
  if (x.import === 'done' && x.result) {
    const { created, skipped } = x.result
    return { label: 'יובא', detail: resultCounts(created, skipped, false), tone: 'ok' }
  }
  if (x.import === 'failed') return { label: 'הייבוא נכשל', detail: x.importError, tone: 'bad' }
  switch (x.read) {
    case 'reading':
      return { label: 'קורא...', tone: 'busy' }
    case 'unreadable':
      return { label: 'לא קריא', detail: x.readError, tone: 'bad' }
    case 'unsupported':
      return { label: 'הספק לא נתמך', tone: 'muted' }
    case 'ready':
      return { label: readyLabel ?? 'מוכן', tone: 'muted' }
  }
}

function StatusIcon({ tone }: { tone: Tone }) {
  if (tone === 'busy') {
    return <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
  }
  if (tone === 'ok') return <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-primary" />
  if (tone === 'bad') return <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-destructive" />
  return <FileSpreadsheet aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
}

/**
 * The files picked for one account: each row shows what the file is and where
 * it stands. Choosing a row shows its grid; the X removes a file not imported yet.
 */
export function FileList({
  files,
  shownId,
  locked,
  onShow,
  onRemove,
  readyLabel,
}: {
  files: BatchFile<File, RawWorkbookPreview>[]
  /** Overrides "מוכן" for a ready file, e.g. one that still needs a column mapping */
  readyLabel?: (id: string) => string | undefined
  shownId: string | null
  /** an import is running: rows can still be viewed, not removed */
  locked: boolean
  onShow: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <ul aria-label="קבצים שנבחרו" className="divide-y rounded-lg border">
      {files.map(x => {
        const s = status(x, readyLabel?.(x.id))
        const shown = x.id === shownId
        const meta = x.preview ? previewSummary(x.preview) : null
        return (
          <li key={x.id} className="flex items-center gap-1 p-1">
            <button
              type="button"
              onClick={() => onShow(x.id)}
              disabled={!x.preview}
              aria-current={shown ? 'true' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-start transition-[background-color,transform] duration-quick ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'enabled:active:scale-[0.99] disabled:cursor-default',
                shown ? 'bg-muted' : 'enabled:hover:bg-muted/60'
              )}
            >
              <StatusIcon tone={s.tone} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={x.file.name}>
                  <bdi>{x.file.name}</bdi>
                </span>
                <span className={cn('block text-xs text-muted-foreground', s.tone === 'bad' && !meta && 'hidden')}>
                  {[meta, s.tone !== 'bad' && s.detail].filter(Boolean).join(' · ') || ' '}
                </span>
                {s.tone === 'bad' && s.detail && (
                  <span className="mt-0.5 block text-xs text-destructive">{s.detail}</span>
                )}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 text-xs',
                  s.tone === 'ok' && 'bg-primary/10 text-primary',
                  s.tone === 'bad' && 'bg-destructive/10 text-destructive',
                  (s.tone === 'muted' || s.tone === 'busy') && 'bg-muted text-muted-foreground',
                  shown && s.tone !== 'ok' && s.tone !== 'bad' && 'bg-background'
                )}
              >
                {s.label}
              </span>
            </button>
            {x.import !== 'done' && (
              <button
                type="button"
                data-remove-id={x.id}
                onClick={() => onRemove(x.id)}
                disabled={locked}
                aria-label={`הסר את ${x.file.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-quick ease-out hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
            {x.import === 'done' && <span aria-hidden className="w-9 shrink-0" />}
          </li>
        )
      })}
    </ul>
  )
}

/** Shown under the list when the account's provider cannot be imported yet. */
export function UnsupportedNote({ account, provider }: { account: string; provider: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        ייבוא ל{account} ({provider}) עדיין לא נתמך: מיפוי עמודות זמין לחשבונות בנק ולכרטיסי אשראי בלבד. אפשר לראות את תוכן הקובץ.
      </span>
    </p>
  )
}
