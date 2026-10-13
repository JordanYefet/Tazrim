'use client'

import { useRef, useState } from 'react'
import { FileSpreadsheet, Info, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { RollingNumber } from '@/components/ui/rolling-number'
import { RawGridPreview } from './raw-grid-preview'
import { AccountPicker, providerLabel, type UploadAccount } from './account-picker'
import { NewCategoriesPrompt } from './new-categories-prompt'
import type { RawFormat, RawWorkbookPreview } from '@/lib/parsers/raw-grid'

type PreviewResponse = RawWorkbookPreview & {
  fileName: string
  account: Pick<UploadAccount, 'id' | 'kind' | 'provider' | 'displayName'>
  importSupported: boolean
}

interface ImportResponse {
  created: number
  skipped: number
  newCategories?: string[]
}

const FORMAT_LABEL: Record<RawFormat, string> = {
  xlsx: 'Excel (xlsx)',
  xls: 'Excel (xls)',
  'xls-html': 'HTML בתור xls',
  csv: 'CSV',
}

function Step({ n, title, disabled, children }: { n: number; title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-lg border bg-card p-4 md:p-6 space-y-4 min-w-0', disabled && 'opacity-60')}>
      <h2 className="font-semibold flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center tabular-nums">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** /upload: choose account -> pick file and see it as a raw grid -> import. */
export function UploadFlow({ accounts, onImported }: { accounts: UploadAccount[]; onImported: () => void }) {
  const [accountId, setAccountId] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [pendingCategories, setPendingCategories] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const account = accounts.find(a => a.id === accountId) ?? null

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setPendingCategories([])
  }

  function chooseAccount(id: string) {
    if (id === accountId) return
    setAccountId(id)
    reset()
  }

  async function loadPreview(f: File) {
    if (!accountId) return
    reset()
    setFile(f)
    setLoading('preview')
    const form = new FormData()
    form.append('file', f)
    form.append('accountId', accountId)
    try {
      const res = await fetch('/api/upload/preview', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה בקריאת הקובץ'); return }
      setPreview(data)
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(null)
    }
  }

  async function runImport() {
    if (!file || !preview) return
    setLoading('import')
    setError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('accountId', preview.account.id)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה בייבוא'); return }
      setResult(data)
      setPendingCategories(data.newCategories ?? [])
      onImported()
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(null)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && accountId) loadPreview(f)
  }

  return (
    <div className="space-y-4 min-w-0">
      <Step n={1} title="לאיזה חשבון הקובץ שייך?">
        <AccountPicker accounts={accounts} value={accountId} onChange={chooseAccount} />
      </Step>

      <Step n={2} title="בחירת קובץ" disabled={!account}>
        <div
          onDragOver={e => { e.preventDefault(); if (account) setDragging(true) }}
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
          <div className="flex-1 text-center sm:text-start min-w-0">
            <p className="text-sm font-medium">
              {account ? <>גרור קובץ לכאן או בחר מהמחשב</> : 'בחר קודם חשבון'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">‎.xlsx · .xls · .csv</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!account || loading !== null}
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
              if (f) loadPreview(f)
            }}
          />
        </div>

        {loading === 'preview' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            קורא את הקובץ...
          </div>
        )}
        {error && !preview && (
          <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </Step>

      {preview && (
        <Step n={3} title="תצוגה מקדימה וייבוא">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium min-w-0 break-all" dir="auto">{preview.fileName}</span>
            <span className="text-xs rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{FORMAT_LABEL[preview.format]}</span>
            {preview.sheets.length > 1 && (
              <span className="text-xs text-muted-foreground">{preview.sheets.length} גיליונות</span>
            )}
          </div>

          <RawGridPreview key={preview.fileName + preview.sheets.length} workbook={preview} />

          {preview.importSupported ? (
            !result && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runImport}
                  disabled={loading !== null}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading === 'import' ? 'מייבא...' : `ייבא ל${preview.account.displayName}`}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={loading !== null}
                  className="border px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  ביטול
                </button>
              </div>
            )
          ) : (
            <p className="flex items-start gap-2 text-sm rounded-lg bg-muted px-3 py-2 text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                ייבוא ל{preview.account.displayName} ({providerLabel(preview.account.provider)}) עדיין לא נתמך. אפשר לראות את תוכן הקובץ, ומיפוי
                עמודות יתווסף בהמשך.
              </span>
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {result && (
            <div className="flex flex-wrap items-center gap-2 text-sm p-3 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-primary font-semibold">
                <RollingNumber value={result.created} format="integer" /> עסקאות חדשות נוספו ל{preview.account.displayName}
              </span>
              {result.skipped > 0 && (
                <span className="text-muted-foreground">
                  · <RollingNumber value={result.skipped} format="integer" /> כפולות דולגו
                </span>
              )}
              <button type="button" onClick={reset} className="ms-auto text-xs underline text-muted-foreground hover:text-foreground">
                קובץ נוסף
              </button>
            </div>
          )}

          {pendingCategories.length > 0 && (
            <NewCategoriesPrompt categories={pendingCategories} onDone={() => setPendingCategories([])} />
          )}
        </Step>
      )}
    </div>
  )
}
