'use client'

import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { RawGridPreview } from '@/components/upload/raw-grid-preview'
import type { RawFormat, RawWorkbookPreview } from '@/lib/parsers/raw-grid'

type PreviewResponse = RawWorkbookPreview & { fileName: string }

const FORMAT_LABEL: Record<RawFormat, string> = {
  xlsx: 'Excel (xlsx)',
  xls: 'Excel (xls)',
  'xls-html': 'HTML בתור xls',
  csv: 'CSV',
}

// Not linked from the nav yet (ENG-22 phase 1): pick any file, see it as a raw grid.
export default function UploadPreviewPage() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load(file: File) {
    setLoading(true)
    setError(null)
    setPreview(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/upload/preview', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה בקריאת הקובץ'); return }
      setPreview(data)
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) load(file)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 min-w-0">
      <div>
        <h1 className="text-2xl font-bold mb-1">תצוגה מקדימה של קובץ</h1>
        <p className="text-muted-foreground text-sm">בחר קובץ מכל ספק כדי לראות את התוכן שלו כטבלה. שום דבר לא נשמר.</p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 flex flex-col sm:flex-row items-center gap-4 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border'
        )}
      >
        <div className={cn('w-11 h-11 shrink-0 rounded-xl flex items-center justify-center', dragging ? 'bg-primary/15' : 'bg-muted')}>
          <Upload className={cn('h-5 w-5', dragging ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div className="flex-1 text-center sm:text-start">
          <p className="text-sm font-medium">גרור קובץ לכאן או בחר מהמחשב</p>
          <p className="text-xs text-muted-foreground mt-0.5">‎.xlsx · .xls · .csv</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          בחר קובץ
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xls,.xlsx,.csv,.tsv,.txt"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) load(f)
          }}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          קורא את הקובץ...
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {preview && (
        <section className="rounded-lg border bg-card p-4 md:p-6 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="font-semibold min-w-0 break-all" dir="auto">{preview.fileName}</h2>
            <span className="text-xs rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{FORMAT_LABEL[preview.format]}</span>
            {preview.sheets.length > 1 && (
              <span className="text-xs text-muted-foreground">{preview.sheets.length} גיליונות</span>
            )}
          </div>
          <RawGridPreview key={preview.fileName + preview.sheets.length} workbook={preview} />
        </section>
      )}
    </div>
  )
}
