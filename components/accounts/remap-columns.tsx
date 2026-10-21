'use client'

import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ColumnMapper, MappedPreview } from '@/components/upload/column-mapper'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { providerLabel } from '@/lib/accounts/brands'
import { headerSignature, type ImportMapping } from '@/lib/import/mapping'
import { buildSnapshot } from '@/lib/import/snapshot'
import { checkMapping, defaultProfileName } from '@/lib/upload/mapping-state'
import type { MapperInfo } from '@/lib/upload/mapper-preview'
import type { RawWorkbookPreview } from '@/lib/parsers/raw-grid'

/*
 * Re-map an account's columns (ENG-65). Uploaded files are not kept, so the
 * user picks the statement again; the mapper starts from the account's saved
 * mapping; saving updates that profile for future uploads; then the file can
 * be re-imported with the new mapping, replacing the rows it brought in
 * before (one transaction, /api/upload/reimport).
 */

export interface RemapAccount {
  id: string
  kind: 'BANK' | 'CREDIT_CARD'
  provider: string
  displayName: string
}

type Preview = RawWorkbookPreview & { fileName: string; mapper: MapperInfo | null }

type Counts = { existing: number; incoming: number }
type Reimported = { created: number; skipped: number; replaced: number }

const nf = new Intl.NumberFormat('he-IL')
const rows = (v: number) => (v === 1 ? 'תנועה אחת' : `${nf.format(v)} תנועות`)

const primary =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50'
const secondary =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border bg-card px-4 text-sm font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97] disabled:opacity-50'

function form(file: File, accountId: string, mapping?: ImportMapping) {
  const f = new FormData()
  f.append('file', file)
  f.append('accountId', accountId)
  if (mapping) f.append('mapping', JSON.stringify(mapping))
  return f
}

async function post<T>(url: string, body: FormData): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', body })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data: data as T } : { ok: false, error: data.error ?? 'הפעולה נכשלה' }
  } catch {
    return { ok: false, error: 'שגיאת רשת' }
  }
}

/** The mapping to start from: the profile this file matches, else the account's own, else the suggestion. */
function startingMapping(preview: Preview): ImportMapping {
  const m = preview.mapper!
  if (m.profile) return m.profile.mapping
  if (m.accountProfile && preview.sheets[m.accountProfile.mapping.sheet]) return m.accountProfile.mapping
  return m.suggestion
}

export function RemapColumns({
  account,
  onBack,
  onImported,
}: {
  account: RemapAccount
  onBack: () => void
  /** Rows changed (refresh the page behind) */
  onImported: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ name: string } | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [done, setDone] = useState<Reimported | null>(null)

  const kind = account.kind === 'CREDIT_CARD' ? 'card' : 'bank'
  const sheet = preview && mapping ? preview.sheets[mapping.sheet] : undefined
  const check = useMemo(() => (preview && mapping ? checkMapping(sheet, mapping, kind) : null), [preview, mapping, sheet, kind])

  async function pick(picked: File | undefined) {
    if (!picked) return
    setFile(picked)
    setPreview(null)
    setMapping(null)
    setSaved(null)
    setCounts(null)
    setDone(null)
    setError(null)
    setImportError(null)
    setReading(true)
    const res = await post<Preview>('/api/upload/preview', form(picked, account.id))
    setReading(false)
    if (!res.ok) return setError(res.error)
    if (!res.data.mapper) return setError('את הקבצים של החשבון הזה האפליקציה קוראת לבד, אין מיפוי עמודות לתקן.')
    setPreview(res.data)
    setMapping(startingMapping(res.data))
  }

  function edit(next: ImportMapping) {
    setMapping(next)
    // A changed mapping is saved (and counted) again
    setSaved(null)
    setCounts(null)
    setDone(null)
  }

  /** Saves into the account's own profile (or the one this file matched, if it is the account's), else creates it. */
  async function save() {
    if (!preview?.mapper || !mapping || !sheet || check?.reason !== null) return
    const m = preview.mapper
    const target = m.profile?.linked ? m.profile : m.accountProfile
    const signature = headerSignature(sheet, mapping.headerRow)
    // the header and a few rows, so the mapping opens later without a file (ENG-69)
    const headers = buildSnapshot(sheet, mapping, kind)
    setSaving(true)
    setError(null)
    try {
      const res = target
        ? await fetch(`/api/import-profiles/${target.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mapping, headerSignature: signature, headers }),
          })
        : await fetch('/api/import-profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: account.id,
              name: defaultProfileName(providerLabel(account.provider), kind),
              mapping,
              headerSignature: signature,
              headers,
              linkAccount: true,
            }),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data.error ?? 'שמירת המיפוי נכשלה')
      setSaved({ name: data.name })
      // What a re-import of this file would replace
      const dry = await post<Counts>('/api/upload/reimport?dryRun=1', form(file!, account.id, mapping))
      if (dry.ok) setCounts(dry.data)
      else setImportError(dry.error)
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  async function reimport() {
    if (!file || !mapping) return
    setImporting(true)
    setImportError(null)
    const res = await post<Reimported>('/api/upload/reimport', form(file, account.id, mapping))
    setImporting(false)
    if (!res.ok) {
      setImportError(res.error)
      setConfirming(false)
      return
    }
    setConfirming(false)
    setDone(res.data)
    onImported()
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="-ms-1 inline-flex items-center gap-0.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        חזרה לעריכה
      </button>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {file ? (
            <p className="truncate text-sm font-medium" dir="auto">{file.name}</p>
          ) : (
            <p className="text-sm font-medium">בחר שוב את קובץ הפירוט</p>
          )}
          <p className="text-xs text-muted-foreground text-pretty">
            הקבצים עצמם לא נשמרים באפליקציה. המיפוי יתחיל מהמיפוי השמור של {account.displayName}.
          </p>
        </div>
        <button type="button" className={secondary} onClick={() => inputRef.current?.click()} disabled={reading || saving || importing}>
          <Upload className="h-4 w-4" aria-hidden />
          {file ? 'קובץ אחר' : 'בחר קובץ'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xls,.xlsx,.csv,.tsv,.txt"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            void pick(f)
          }}
        />
      </div>

      {reading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden />
          קורא את הקובץ...
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {preview?.mapper && mapping && check && (
        <>
          {preview.mapper.profile ? (
            <p className="text-xs text-muted-foreground">
              הקובץ זוהה עם המיפוי השמור <b>{preview.mapper.profile.name}</b>. שנה את מה שצריך תיקון.
            </p>
          ) : preview.mapper.accountProfile ? (
            <p className="text-xs text-muted-foreground">
              הקובץ לא תואם בדיוק למיפוי השמור <b>{preview.mapper.accountProfile.name}</b>, לכן המיפוי מתחיל ממנו. בדוק את שורת
              הכותרת והעמודות.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">אין לחשבון מיפוי שמור עדיין. זו הצעה לפי כותרות הקובץ.</p>
          )}

          <ColumnMapper key={`${file?.name}-${mapping.sheet}`} workbook={preview} kind={preview.mapper.kind} mapping={mapping} onChange={edit} />
          <MappedPreview
            kind={preview.mapper.kind}
            sheet={sheet}
            mapping={mapping}
            check={check}
            totalRows={sheet?.rowCount}
          />

          {!saved ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primary} onClick={save} disabled={saving || check.reason !== null}>
                {saving ? 'שומר...' : 'שמור מיפוי'}
              </button>
              {check.reason && <p className="text-xs text-muted-foreground" aria-live="polite">{check.reason}</p>}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4" role="status">
              <p className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  המיפוי <b>{saved.name}</b> נשמר. קבצים הבאים של {account.displayName} ייקראו לפיו.
                </span>
              </p>
              {done ? (
                <p className="text-sm text-muted-foreground">
                  הייבוא מחדש הסתיים: {rows(done.replaced)} הוחלפו, {rows(done.created)} יובאו
                  {done.skipped > 0 && <>, {rows(done.skipped)} דולגו כי כבר קיימות בחשבון מקבצים אחרים</>}.
                </p>
              ) : counts ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground text-pretty">
                    {counts.existing > 0
                      ? <>מהקובץ הזה יובאו בעבר {rows(counts.existing)}. אפשר לייבא אותו מחדש עם המיפוי המתוקן.</>
                      : <>לא נמצאו בחשבון תנועות מקובץ בשם הזה. אפשר לייבא אותו עכשיו עם המיפוי.</>}
                  </p>
                  <button type="button" className={cn(secondary, 'shrink-0')} onClick={() => setConfirming(true)}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    {counts.existing > 0 ? 'ייבוא מחדש' : 'ייבוא'}
                  </button>
                </div>
              ) : null}
              {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
            </div>
          )}
        </>
      )}

      {counts && file && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={o => !importing && setConfirming(o)}
          onConfirm={reimport}
          busy={importing}
          busyLabel="מייבא..."
          destructive={counts.existing > 0}
          confirmLabel={counts.existing > 0 ? `החלף ${nf.format(counts.existing)} תנועות` : 'ייבא'}
          title={counts.existing > 0 ? `להחליף ${rows(counts.existing)}?` : 'לייבא את הקובץ?'}
          description={
            <>
              {counts.existing > 0 ? (
                <p>
                  {rows(counts.existing)} שיובאו בעבר מהקובץ <bdi className="font-medium text-foreground">{file.name}</bdi> יימחקו, ו־
                  {rows(counts.incoming)} מהקובץ ייובאו מחדש לפי המיפוי המתוקן.
                </p>
              ) : (
                <p>
                  {rows(counts.incoming)} מהקובץ <bdi className="font-medium text-foreground">{file.name}</bdi> ייובאו לפי המיפוי.
                </p>
              )}
              {counts.existing > 0 && <p>הערות ושינויי קטגוריה שעשית בתנועות האלה יאבדו. אם משהו נכשל באמצע, לא משתנה דבר.</p>}
            </>
          }
        />
      )}
    </div>
  )
}
