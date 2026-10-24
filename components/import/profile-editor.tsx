'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { ColumnMapper, MappedPreview } from '@/components/upload/column-mapper'
import { validateMapping, type ImportMapping, type MappingKind } from '@/lib/import/mapping'
import { snapshotSheet, type HeaderSnapshot } from '@/lib/import/snapshot'
import { checkMapping } from '@/lib/upload/mapping-state'
import type { RawWorkbookPreview } from '@/lib/parsers/raw-grid'

/*
 * Edit a saved mapping without a file (ENG-69): the column mapper opens on the
 * header row (and sample rows) stored with the profile. Saving updates the
 * profile only; nothing is re-imported (that is "re-map" with a file, ENG-65).
 */

interface EditPayload {
  id: string
  name: string
  kind: MappingKind
  mapping: ImportMapping
  snapshot: HeaderSnapshot | null
  account: { id: string; displayName: string } | null
}

const primary =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50'
const secondary =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border bg-card px-4 text-sm font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97] disabled:opacity-50'

export function ProfileEditor({
  profileId,
  onSaved,
  onCancel,
  onNeedFile,
  cancelLabel = 'ביטול',
}: {
  profileId: string
  onSaved: (profile: { id: string; name: string }) => void
  onCancel: () => void
  /** Offered when the profile has no stored header (pick the file once) */
  onNeedFile?: () => void
  cancelLabel?: string
}) {
  const [data, setData] = useState<EditPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // edited on sheet 0 of the stored-header workbook; the real sheet index goes back on save
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setLoadError(null)
    fetch(`/api/import-profiles/${profileId}`)
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!live) return
        if (!res.ok) return setLoadError(body.error ?? 'לא ניתן לפתוח את המיפוי')
        setData(body as EditPayload)
        setMapping({ ...(body as EditPayload).mapping, sheet: 0 })
      })
      .catch(() => live && setLoadError('שגיאת רשת'))
    return () => {
      live = false
    }
  }, [profileId])

  const snapshot = data?.snapshot ?? null
  const sheet = useMemo(
    () => (snapshot && mapping ? snapshotSheet(snapshot, mapping, data?.name ?? '') : undefined),
    [snapshot, mapping, data?.name]
  )
  const workbook: RawWorkbookPreview | null = sheet ? { format: 'csv', sheets: [{ ...sheet, omittedRowCount: 0 }] } : null
  const hasSamples = !!snapshot && snapshot.samples.length > 0
  // the samples are only a few rows: the file's last-row setting doesn't apply to them
  const check = useMemo(() => {
    if (!sheet || !mapping || !data) return null
    const { endRow: _end, ...rest } = mapping
    return checkMapping(sheet, rest, data.kind)
  }, [sheet, mapping, data])
  const valid = data && mapping ? validateMapping(mapping, data.kind) : null

  async function save() {
    if (!data || !mapping || !valid?.ok) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/import-profiles/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: { ...mapping, sheet: data.mapping.sheet } }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(body.error ?? 'שמירת המיפוי נכשלה')
      setSaved(true)
      onSaved({ id: body.id, name: body.name })
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>
  if (!data || !mapping) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (!snapshot || !workbook || !check) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 text-sm text-pretty">
            לא נשמרו כותרות עם המיפוי הזה, לכן צריך לבחור פעם אחת קובץ. אחרי השמירה אפשר יהיה לערוך אותו כאן גם בלי קובץ.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {onNeedFile && (
            <button type="button" className={primary} onClick={onNeedFile}>
              בחירת קובץ
            </button>
          )}
          <button type="button" className={secondary} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <ColumnMapper workbook={workbook} kind={data.kind} mapping={mapping} onChange={next => (setMapping(next), setSaved(false))} fileless />

      {hasSamples ? (
        <MappedPreview kind={data.kind} sheet={sheet} mapping={mapping} check={check} />
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground text-pretty">
          {snapshot.rebuilt
            ? 'הכותרות שוחזרו מהמיפוי השמור, בלי שורות לדוגמה. תצוגה מקדימה תופיע בהעלאת הקובץ הבא.'
            : 'אין שורות לדוגמה שמורות. תצוגה מקדימה תופיע בהעלאת הקובץ הבא.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} onClick={save} disabled={saving || !valid?.ok}>
          {saving ? 'שומר...' : 'שמור מיפוי'}
        </button>
        <button type="button" className={secondary} onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </button>
        {valid && !valid.ok && <p className="text-xs text-muted-foreground" aria-live="polite">{valid.error}</p>}
        {saved && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            נשמר. הייבוא הבא יקרא לפיו.
          </p>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
