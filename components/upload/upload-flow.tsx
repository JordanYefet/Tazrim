'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkCheck, FileSpreadsheet, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { RollingNumber } from '@/components/ui/rolling-number'
import { RawGridPreview } from './raw-grid-preview'
import { AccountPicker, providerLabel, type UploadAccount } from './account-picker'
import { NewCategoriesPrompt } from './new-categories-prompt'
import { SkippedRows } from './skipped-rows'
import { FileList, FORMAT_LABEL, resultCounts, UnsupportedNote } from './file-list'
import { ColumnMapper, MappedPreview } from './column-mapper'
import { SaveProfile, SavedProfileNote, type SavedProfile } from './save-profile'
import type { RawWorkbookPreview } from '@/lib/parsers/raw-grid'
import { headerSignature, type ImportMapping } from '@/lib/import/mapping'
import { buildSnapshot } from '@/lib/import/snapshot'
import { mappedSheets } from '@/lib/import/sheets'
import type { MapperInfo } from '@/lib/upload/mapper-preview'
import { checkMapping, defaultProfileName, type MappingCheck } from '@/lib/upload/mapping-state'
import {
  addFiles,
  applyForceToFile,
  applyImportOutcome,
  applyPreviewOutcome,
  batchTotals,
  importableIds,
  mapWithLimit,
  mergeNewCategories,
  removeFile,
  runInSequence,
  selectedOrFirstReady,
  setImporting,
  type BatchFile,
  type FileImportResult,
  type ImportOutcome,
  type PreviewOutcome,
} from '@/lib/upload/batch'

type PreviewResponse = RawWorkbookPreview & {
  fileName: string
  account: Pick<UploadAccount, 'id' | 'kind' | 'provider' | 'displayName'>
  importSupported: boolean
  /** ENG-69: a Leumi / Max account set to import through its own mapping */
  customImport?: boolean
  /** Set for providers without a built-in parser: the files are imported through a column mapping */
  mapper: MapperInfo | null
}

type Entry = BatchFile<File, PreviewResponse>

/**
 * One mapping shared by every file with the same header signature (ENG-23).
 * `profile`: a saved profile applied as is (imported by id); editing drops it
 * and keeps it as `basedOn`, so the edit can update that profile.
 */
interface MapGroup {
  mapping: ImportMapping
  profile: SavedProfile | null
  basedOn: SavedProfile | null
  editing: boolean
  saved?: SavedProfile
  dismissed?: boolean
}

function newGroup(mapper: MapperInfo): MapGroup {
  return mapper.profile
    ? { mapping: mapper.profile.mapping, profile: { id: mapper.profile.id, name: mapper.profile.name }, basedOn: null, editing: false }
    : {
        mapping: mapper.suggestion,
        profile: null,
        // a file that doesn't match the account's own mapping (e.g. one seeded from a built-in
        // layout, ENG-69): saving afterwards updates that mapping instead of adding another
        basedOn: mapper.accountProfile ? { id: mapper.accountProfile.id, name: mapper.accountProfile.name } : null,
        editing: true,
      }
}

/** What a mapped file was imported with, so a force re-post uses the same. */
type ImportedWith = { mapping: ImportMapping } | { profileId: string }

/** Previews are read-only, so a couple may run at once; imports never overlap. */
const PREVIEW_CONCURRENCY = 2

const nf = new Intl.NumberFormat('he-IL')

function Step({ n, title, disabled, children }: { n: number; title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn('min-w-0 space-y-4 rounded-xl surface p-4 sm:p-6', disabled && 'opacity-60')}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center tabular-nums">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

async function postForm<T>(url: string, form: FormData, fallback: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? fallback }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'שגיאת רשת' }
  }
}

function uploadForm(file: File, accountId: string, force?: number[], using?: ImportedWith) {
  const form = new FormData()
  form.append('file', file)
  form.append('accountId', accountId)
  if (force) form.append('force', JSON.stringify(force))
  if (using && 'profileId' in using) form.append('profileId', using.profileId)
  if (using && 'mapping' in using) form.append('mapping', JSON.stringify(using.mapping))
  return form
}

/**
 * /upload: choose account -> pick one or more files (each read as a raw grid)
 * -> import them one after another, so de-dup sees the rows earlier files stored.
 */
export function UploadFlow({ accounts, onImported }: { accounts: UploadAccount[]; onImported: () => void }) {
  const [accountId, setAccountId] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null)
  const [files, setFiles] = useState<Entry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ k: number; n: number } | null>(null)
  const [forcing, setForcing] = useState<string | null>(null)
  const [forceError, setForceError] = useState<{ id: string; message: string } | null>(null)
  // files whose skipped list the user worked in stay open when it re-renders after a force
  const [forcedIds, setForcedIds] = useState<Set<string>>(new Set())
  const [pendingCategories, setPendingCategories] = useState<string[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  // set by remove(): the file whose X takes focus after the row is gone ('' = the picker button)
  const focusAfterRemove = useRef<string | null>(null)
  // bumped on reset so previews or imports of a cleared list are dropped
  const generation = useRef(0)
  // mapped accounts: one mapping per header signature, and what each file was imported with
  const [groups, setGroups] = useState<Record<string, MapGroup>>({})
  const importedWith = useRef(new Map<string, ImportedWith>())

  const account = accounts.find(a => a.id === accountId) ?? null
  const busy = progress !== null || forcing !== null
  const single = files.length === 1
  const shownId = selectedOrFirstReady(files, selectedId)
  const shown = files.find(x => x.id === shownId) ?? null
  const totals = batchTotals(files)
  const imported = files.filter(x => x.import === 'done' && x.result)
  const reading = files.some(x => x.read === 'reading')

  const groupKey = (x: Entry) => (x.preview?.mapper ? x.preview.mapper.signature : null)
  // each mapped file checked against its group's mapping (previews are capped, so this stays cheap)
  const checks = useMemo(() => {
    const out = new Map<string, MappingCheck>()
    for (const x of files) {
      const key = groupKey(x)
      const group = key !== null ? groups[key] : undefined
      if (!x.preview?.mapper || !group) continue
      out.set(x.id, checkMapping(x.preview.sheets[group.mapping.sheet], group.mapping, x.preview.mapper.kind))
    }
    return out
  }, [files, groups])
  const mappedReady = (id: string) => {
    const x = files.find(f => f.id === id)
    return !x?.preview?.mapper || checks.get(id)?.reason === null
  }
  const ready = importableIds(files)
  const queue = ready.filter(mappedReady)
  const waiting = ready.filter(id => !mappedReady(id))

  function usingFor(x: Entry): ImportedWith | undefined {
    const key = groupKey(x)
    const group = key !== null ? groups[key] : undefined
    if (!group) return undefined
    return group.profile ? { profileId: group.profile.id } : { mapping: group.mapping }
  }

  function updateGroup(key: string, patch: Partial<MapGroup>) {
    setGroups(g => (g[key] ? { ...g, [key]: { ...g[key], ...patch } } : g))
  }

  function editMapping(key: string, mapping: ImportMapping) {
    setGroups(g => {
      const cur = g[key]
      if (!cur) return g
      return { ...g, [key]: { ...cur, mapping, profile: null, basedOn: cur.profile ?? cur.basedOn, editing: true } }
    })
  }

  function reset() {
    generation.current++
    setGroups({})
    importedWith.current.clear()
    setFiles([])
    setSelectedId(null)
    setProgress(null)
    setForcing(null)
    setForceError(null)
    setForcedIds(new Set())
    setPendingCategories([])
    setAnnouncement('')
  }

  function chooseAccount(id: string) {
    if (id === accountId || busy) return
    setAccountId(id)
    reset()
  }

  function add(picked: File[]) {
    if (!accountId || busy || !picked.length) return
    // like before multi-file: a single file that could not be read is replaced by the next pick
    const base = files.length === 1 && files[0].read === 'unreadable' ? [] : files
    const { list, added } = addFiles<File, PreviewResponse>(base, picked)
    if (list === base && base === files) return
    setFiles(list)
    if (added.length) readPreviews(added, accountId)
  }

  function readPreviews(added: Entry[], forAccount: string) {
    const gen = generation.current
    void mapWithLimit(added, PREVIEW_CONCURRENCY, async entry => {
      const res = await postForm<PreviewResponse>('/api/upload/preview', uploadForm(entry.file, forAccount), 'שגיאה בקריאת הקובץ')
      if (gen !== generation.current) return
      const outcome: PreviewOutcome<PreviewResponse> = res.ok
        ? { ok: true, preview: res.data, importSupported: res.data.importSupported }
        : { ok: false, error: res.error }
      const mapper = res.ok ? res.data.mapper : null
      if (mapper) setGroups(g => (g[mapper.signature] ? g : { ...g, [mapper.signature]: newGroup(mapper) }))
      setFiles(list => applyPreviewOutcome(list, entry.id, outcome))
    })
  }

  function remove(id: string) {
    const i = files.findIndex(x => x.id === id)
    const next = removeFile(files, id)
    setFiles(next)
    if (forceError?.id === id) setForceError(null)
    // keep keyboard focus in the list: the next row's X, else the previous, else the picker button
    focusAfterRemove.current = (next[i] ?? next[i - 1])?.id ?? ''
  }

  useEffect(() => {
    const id = focusAfterRemove.current
    if (id === null) return
    focusAfterRemove.current = null
    const target = id
      ? [...document.querySelectorAll<HTMLButtonElement>('[data-remove-id]')].find(b => b.dataset.removeId === id)
      : undefined
    ;(target ?? pickRef.current)?.focus()
  }, [files])

  async function importAll() {
    if (!account || busy) return
    const gen = generation.current
    const batch = queue.map(id => files.find(x => x.id === id)!).filter(Boolean)
    if (!batch.length) return
    const n = batch.length
    const results: FileImportResult[] = []
    setForceError(null)
    await runInSequence(batch, async (entry, i) => {
      if (gen !== generation.current) return
      setProgress({ k: i + 1, n })
      setAnnouncement(n > 1 ? `מייבא קובץ ${i + 1} מתוך ${n}: ${entry.file.name}` : 'מייבא...')
      setFiles(list => setImporting(list, entry.id))
      const using = usingFor(entry)
      if (using) importedWith.current.set(entry.id, using)
      const res = await postForm<FileImportResult>('/api/upload', uploadForm(entry.file, account.id, undefined, using), 'שגיאה בייבוא')
      if (gen !== generation.current) return
      const outcome: ImportOutcome = res.ok ? { ok: true, result: res.data } : { ok: false, error: res.error }
      if (outcome.ok) results.push(outcome.result)
      setFiles(list => applyImportOutcome(list, entry.id, outcome))
    })
    if (gen !== generation.current) return
    setProgress(null)
    const created = results.reduce((s, r) => s + r.created, 0)
    const failed = n - results.length
    setAnnouncement(
      `הייבוא הסתיים: ${nf.format(created)} עסקאות חדשות` + (failed ? `, ${failed === 1 ? 'קובץ אחד נכשל' : `${failed} קבצים נכשלו`}` : '')
    )
    const categories = mergeNewCategories(results)
    if (categories.length) setPendingCategories(prev => mergeNewCategories([{ newCategories: prev }, { newCategories: categories }]))
    if (results.length) onImported()
  }

  /** Re-posts one file with `force` and folds the result into that file only. */
  async function force(entry: Entry, indexes: number[]) {
    if (!account || busy) return
    const gen = generation.current
    setForcing(entry.id)
    setForceError(null)
    const res = await postForm<FileImportResult>(
      '/api/upload',
      uploadForm(entry.file, account.id, indexes, importedWith.current.get(entry.id)),
      'שגיאה בייבוא'
    )
    if (gen !== generation.current) return
    setForcing(null)
    if (!res.ok) {
      setForceError({ id: entry.id, message: res.error })
      return
    }
    setFiles(list => applyForceToFile(list, entry.id, indexes, res.data))
    setForcedIds(prev => new Set(prev).add(entry.id))
    setAnnouncement(`${nf.format(res.data.created)} שורות יובאו בכל זאת`)
    onImported()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    add([...e.dataTransfer.files])
  }

  const accountName = account?.displayName ?? shown?.preview?.account.displayName ?? ''
  const importLabel = progress
    ? progress.n > 1
      ? `מייבא קובץ ${progress.k} מתוך ${progress.n}...`
      : 'מייבא...'
    : single || queue.length === 0
      ? `ייבא ל${accountName}`
      : queue.length === 1
        ? `ייבא קובץ אחד ל${accountName}`
        : `ייבא ${queue.length} קבצים ל${accountName}`
  const unsupported = files.find(x => x.read === 'unsupported')?.preview
  const canForce = account?.kind === 'CREDIT_CARD'

  // the shown file's mapping, when its account imports through one
  const shownMapper = shown?.preview?.mapper ?? null
  const shownKey = shown ? groupKey(shown) : null
  const shownGroup = shownKey !== null ? groups[shownKey] : undefined
  const shownCheck = shown ? checks.get(shown.id) : undefined
  const shownDone = shown?.import === 'done'
  const mapping = shownMapper && shownGroup && shownCheck ? { mapper: shownMapper, group: shownGroup, check: shownCheck, key: shownKey! } : null
  const sharing = mapping ? files.filter(x => x.id !== shown!.id && groupKey(x) === mapping.key && x.import !== 'done').length : 0
  const stepTitle = mapping && mapping.group.editing && !shownDone ? 'מיפוי עמודות' : 'תצוגה מקדימה וייבוא'
  const showImport = queue.length > 0 || progress !== null || waiting.length > 0
  const shownWaiting = shown && waiting.includes(shown.id) ? shownCheck?.reason : null
  const othersWaiting =
    queue.length === 0
      ? waiting.length === 1 ? 'קובץ אחד ממתין למיפוי' : waiting.length > 1 ? `${waiting.length} קבצים ממתינים למיפוי` : null
      : waiting.length === 1
        ? 'קובץ אחד ממתין למיפוי ולא ייובא עכשיו'
        : waiting.length > 1 ? `${waiting.length} קבצים ממתינים למיפוי ולא ייובאו עכשיו` : null
  // the shown file's own reason first, then the batch's
  const blockReason = progress ? null : shownWaiting && queue.length > 0 ? `${shownWaiting} · ${othersWaiting}` : shownWaiting ?? othersWaiting
  // offer to save each hand-made mapping once a file imported with it
  const toSave = [
    ...new Set(
      imported
        .map(x => groupKey(x))
        .filter((k): k is string => k !== null && !!groups[k] && !groups[k].profile && !groups[k].dismissed)
    ),
  ]
  const providerName = account ? providerLabel(account.provider) : ''

  return (
    <div className="space-y-4 min-w-0">
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      <Step n={1} title="לאיזה חשבון הקובץ שייך?">
        <AccountPicker accounts={accounts} value={accountId} onChange={chooseAccount} />
      </Step>

      <Step n={2} title="בחירת קובץ" disabled={!account}>
        <div
          onDragOver={e => { e.preventDefault(); if (account && !busy) setDragging(true) }}
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
            <p className="text-xs text-muted-foreground mt-0.5">‎.xlsx · .xls · .csv · אפשר כמה קבצים של אותו חשבון</p>
          </div>
          <button
            ref={pickRef}
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!account || busy}
            className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-[background-color,transform] duration-quick ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {files.length ? 'הוסף קבצים' : 'בחר קובץ'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".xls,.xlsx,.csv,.tsv,.txt"
            onChange={e => {
              const picked = [...(e.target.files ?? [])]
              e.target.value = ''
              add(picked)
            }}
          />
        </div>

        {single && files[0].read === 'reading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            קורא את הקובץ...
          </div>
        )}
        {single && files[0].read === 'unreadable' && (
          <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{files[0].readError}</p>
        )}

        {files.length > 1 && (
          <FileList
            files={files}
            shownId={shownId}
            locked={busy}
            onShow={setSelectedId}
            onRemove={remove}
            readyLabel={id => {
              const x = files.find(f => f.id === id)
              if (!x?.preview?.mapper) return undefined
              if (!mappedReady(id)) return 'צריך מיפוי'
              const key = groupKey(x)
              return key !== null && groups[key]?.profile ? 'מיפוי שמור' : undefined
            }}
          />
        )}
      </Step>

      {shown?.preview && (
        <Step n={3} title={stepTitle}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium min-w-0 break-all" dir="auto">{shown.preview.fileName}</span>
            <span className="text-xs rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{FORMAT_LABEL[shown.preview.format]}</span>
            {shown.preview.sheets.length > 1 && (
              <span className="text-xs text-muted-foreground">{shown.preview.sheets.length} גיליונות</span>
            )}
          </div>

          {shown.preview.customImport && mapping && !shownDone && (
            <p className="text-xs text-muted-foreground">
              {accountName} מוגדר לייבוא לפי מיפוי מותאם במקום הייבוא המובנה. אפשר לשנות את זה בחלון עריכת החשבון.
            </p>
          )}
          {mapping ? (
            <>
              {mapping.group.profile && !shownDone && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                  <BookmarkCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    זוהה מיפוי שמור: <span className="font-medium">{mapping.group.profile.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => updateGroup(mapping.key, { editing: true, basedOn: mapping.group.profile, profile: null })}
                    disabled={busy}
                    className="ms-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                  >
                    שנה מיפוי
                  </button>
                </div>
              )}
              {mapping.group.editing && !shownDone && (
                <ColumnMapper
                  key={`${shown.id}-${mapping.group.mapping.sheet}`}
                  workbook={shown.preview}
                  kind={mapping.mapper.kind}
                  mapping={mapping.group.mapping}
                  onChange={next => editMapping(mapping.key, next)}
                />
              )}
              {sharing > 0 && mapping.group.editing && !shownDone && (
                <p className="text-xs text-muted-foreground">
                  המיפוי חל גם על {sharing === 1 ? 'קובץ נוסף' : `${sharing} קבצים נוספים`} עם אותן כותרות.
                </p>
              )}
              <MappedPreview
                kind={mapping.mapper.kind}
                sheet={shown.preview.sheets[mapping.group.mapping.sheet]}
                mapping={mapping.group.mapping}
                check={mapping.check}
                totalRows={shown.preview.sheets[mapping.group.mapping.sheet]?.rowCount}
                otherSheets={mappedSheets(shown.preview, mapping.group.mapping)
                  .slice(1)
                  .map(s => shown.preview!.sheets[s.index].name)}
              />
            </>
          ) : (
            <RawGridPreview key={shown.id} workbook={shown.preview} />
          )}

          {unsupported ? (
            <UnsupportedNote account={unsupported.account.displayName} provider={providerLabel(unsupported.account.provider)} />
          ) : (
            showImport && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={importAll}
                    disabled={busy || reading || queue.length === 0}
                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-[background-color,transform] duration-quick ease-out active:scale-[0.97] disabled:opacity-50"
                  >
                    {importLabel}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="border px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  {reading && !busy && <span className="text-xs text-muted-foreground">ממתין שכל הקבצים ייקראו...</span>}
                </div>
                {blockReason && !reading && !busy && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">{blockReason}</p>
                )}
                {progress && progress.n > 1 && (
                  <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-transform duration-fast ease-out ltr:origin-left rtl:origin-right"
                      style={{ transform: `scaleX(${(progress.k - 1 + 0.5) / progress.n})` }}
                    />
                  </div>
                )}
              </div>
            )
          )}

          {single && files[0].import === 'failed' && (
            <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{files[0].importError}</p>
          )}

          {imported.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm p-3 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-primary font-semibold">
                <RollingNumber value={totals.created} format="integer" /> עסקאות חדשות נוספו ל{accountName}
              </span>
              {totals.skipped > 0 && (
                <span className="text-muted-foreground">
                  · <RollingNumber value={totals.skipped} format="integer" /> כבר קיימות ודולגו
                </span>
              )}
              {totals.pending > 0 && (
                <span className="text-muted-foreground">
                  · {totals.pending === 1 ? 'עסקה אחת שטרם נקלטה לא יובאה' : `${totals.pending} עסקאות שטרם נקלטו לא יובאו`}, הן ייכנסו עם הפירוט הבא
                </span>
              )}
              {!single && (
                <span className="text-muted-foreground">
                  · {totals.imported === 1 ? 'מקובץ אחד' : `מ־${totals.imported} קבצים`}
                  {totals.failed > 0 && <span className="text-destructive"> · {totals.failed === 1 ? 'קובץ אחד נכשל' : `${totals.failed} קבצים נכשלו`}</span>}
                </span>
              )}
              {!busy && queue.length === 0 && (
                <button type="button" onClick={reset} className="ms-auto text-xs underline text-muted-foreground hover:text-foreground">
                  {single ? 'קובץ נוסף' : 'קבצים נוספים'}
                </button>
              )}
            </div>
          )}

          {single
            ? imported[0]?.result && (
                <>
                  <SkippedRows
                    key={imported[0].result.skippedRows.length}
                    rows={imported[0].result.skippedRows}
                    canForce={canForce}
                    busy={forcing !== null}
                    onForce={indexes => force(imported[0], indexes)}
                  />
                  {forceError && (
                    <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{forceError.message}</p>
                  )}
                </>
              )
            : imported.some(x => x.result!.skippedRows.length > 0 || forceError?.id === x.id) && (
                <div className="space-y-3">
                  {imported.map(x =>
                    x.result!.skippedRows.length > 0 || forceError?.id === x.id ? (
                      <div key={x.id} className="space-y-2">
                        <p className="flex min-w-0 items-baseline gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium" dir="auto" title={x.file.name}>{x.file.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {resultCounts(x.result!.created, x.result!.skipped)}
                          </span>
                        </p>
                        <SkippedRows
                          key={x.result!.skippedRows.length}
                          rows={x.result!.skippedRows}
                          canForce={canForce}
                          busy={forcing !== null}
                          defaultOpen={forcedIds.has(x.id)}
                          onForce={indexes => force(x, indexes)}
                        />
                        {forceError?.id === x.id && (
                          <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{forceError.message}</p>
                        )}
                      </div>
                    ) : null
                  )}
                </div>
              )}

          {account &&
            !busy &&
            toSave.map(key => {
              const group = groups[key]
              const sample = files.find(x => groupKey(x) === key && x.preview)?.preview
              const sheet = sample?.sheets[group.mapping.sheet]
              if (!sample?.mapper || !sheet) return null
              return group.saved ? (
                <SavedProfileNote key={key} name={group.saved.name} />
              ) : (
                <SaveProfile
                  key={key}
                  accountId={account.id}
                  accountName={account.displayName}
                  defaultName={defaultProfileName(providerName, sample.mapper.kind)}
                  mapping={group.mapping}
                  headerSignature={headerSignature(sheet, group.mapping.headerRow)}
                  headers={buildSnapshot(sheet, group.mapping, sample.mapper.kind)}
                  basedOn={group.basedOn}
                  onSaved={profile => updateGroup(key, { saved: profile })}
                  onDismiss={() => updateGroup(key, { dismissed: true })}
                />
              )
            })}

          {pendingCategories.length > 0 && !busy && (
            <NewCategoriesPrompt
              key={pendingCategories.join('\u0000')}
              categories={pendingCategories}
              severalFiles={imported.length > 1}
              onDone={() => setPendingCategories([])}
            />
          )}
        </Step>
      )}
    </div>
  )
}
