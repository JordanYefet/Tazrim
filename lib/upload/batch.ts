/**
 * Client-side state for uploading several files of one account: the file list,
 * each file's read (preview) and import status, and the batch's merged results.
 * Pure functions over an immutable list so the upload flow can stay a thin shell.
 */
import type { SkippedRow } from './import'

export interface FileImportResult {
  created: number
  skipped: number
  skippedRows: SkippedRow[]
  newCategories?: string[]
}

/** reading: preview in flight; unsupported: readable, but the account's provider cannot be imported yet */
export type ReadStatus = 'reading' | 'ready' | 'unreadable' | 'unsupported'
export type ImportStatus = 'idle' | 'importing' | 'done' | 'failed'

export interface BatchFile<F, P> {
  id: string
  file: F
  read: ReadStatus
  readError?: string
  preview?: P
  import: ImportStatus
  importError?: string
  result?: FileImportResult
}

export type PreviewOutcome<P> = { ok: true; preview: P; importSupported: boolean } | { ok: false; error: string }
export type ImportOutcome = { ok: true; result: FileImportResult } | { ok: false; error: string }

type FileLike = { name: string; size: number }

/** Two picks of the same name and size are treated as the same file. */
export const fileKey = (file: FileLike) => `${file.name}\u0000${file.size}`

/** Appends the files not in the list yet; `added` are the new entries (to read). */
export function addFiles<F extends FileLike, P>(
  list: BatchFile<F, P>[],
  files: Iterable<F>
): { list: BatchFile<F, P>[]; added: BatchFile<F, P>[] } {
  const seen = new Set(list.map(x => x.id))
  const added: BatchFile<F, P>[] = []
  for (const file of files) {
    const id = fileKey(file)
    if (seen.has(id)) continue
    seen.add(id)
    added.push({ id, file, read: 'reading', import: 'idle' })
  }
  return { list: added.length ? [...list, ...added] : list, added }
}

export function removeFile<F, P>(list: BatchFile<F, P>[], id: string): BatchFile<F, P>[] {
  return list.filter(x => x.id !== id)
}

function update<F, P>(list: BatchFile<F, P>[], id: string, fn: (x: BatchFile<F, P>) => BatchFile<F, P>) {
  return list.some(x => x.id === id) ? list.map(x => (x.id === id ? fn(x) : x)) : list
}

/** A no-op for a file removed while its preview was in flight. */
export function applyPreviewOutcome<F, P>(list: BatchFile<F, P>[], id: string, outcome: PreviewOutcome<P>) {
  return update(list, id, x =>
    outcome.ok
      ? { ...x, read: outcome.importSupported ? 'ready' : 'unsupported', preview: outcome.preview, readError: undefined }
      : { ...x, read: 'unreadable', readError: outcome.error, preview: undefined }
  )
}

/** Files the import button would import, in list order: ready and not imported (a failed one may retry). */
export function importableIds<F, P>(list: BatchFile<F, P>[]): string[] {
  return list.filter(x => x.read === 'ready' && (x.import === 'idle' || x.import === 'failed')).map(x => x.id)
}

export function setImporting<F, P>(list: BatchFile<F, P>[], id: string) {
  return update(list, id, x => ({ ...x, import: 'importing' }))
}

export function applyImportOutcome<F, P>(list: BatchFile<F, P>[], id: string, outcome: ImportOutcome) {
  return update(list, id, x =>
    outcome.ok
      ? { ...x, import: 'done', result: outcome.result, importError: undefined }
      : { ...x, import: 'failed', importError: outcome.error }
  )
}

/** Folds a `force` re-post into the file's result: those rows move from skipped to created. */
export function applyForceResult(
  result: FileImportResult,
  force: number[],
  response: Pick<FileImportResult, 'created'>
): FileImportResult {
  const forced = new Set(force)
  return {
    ...result,
    created: result.created + response.created,
    skipped: result.skipped - response.created,
    skippedRows: result.skippedRows.filter(r => !forced.has(r.index)),
  }
}

export function applyForceToFile<F, P>(
  list: BatchFile<F, P>[],
  id: string,
  force: number[],
  response: Pick<FileImportResult, 'created'>
) {
  return update(list, id, x => (x.result ? { ...x, result: applyForceResult(x.result, force, response) } : x))
}

export function batchTotals<F, P>(list: BatchFile<F, P>[]) {
  let created = 0
  let skipped = 0
  let imported = 0
  let failed = 0
  for (const x of list) {
    if (x.import === 'failed') failed++
    if (x.import !== 'done' || !x.result) continue
    imported++
    created += x.result.created
    skipped += x.result.skipped
  }
  return { created, skipped, imported, failed }
}

/** Every file's new categories, once each, in the order first seen. */
export function mergeNewCategories(results: Pick<FileImportResult, 'newCategories'>[]): string[] {
  return [...new Set(results.flatMap(r => r.newCategories ?? []))]
}

/** The file whose grid to show: the selection while it has a preview, else the first ready one (or any readable). */
export function selectedOrFirstReady<F, P>(list: BatchFile<F, P>[], selected: string | null): string | null {
  const current = selected ? list.find(x => x.id === selected) : undefined
  if (current?.preview) return current.id
  return (list.find(x => x.read === 'ready') ?? list.find(x => x.preview))?.id ?? null
}

/**
 * Runs `fn` over the items one at a time, so each import sees the rows the
 * previous ones stored (de-dup across files). A throw doesn't stop the rest;
 * the items that threw are returned.
 */
export async function runInSequence<T>(items: T[], fn: (item: T, index: number) => Promise<void>): Promise<T[]> {
  const failed: T[] = []
  for (let i = 0; i < items.length; i++) {
    try {
      await fn(items[i], i)
    } catch {
      failed.push(items[i])
    }
  }
  return failed
}

/** Runs `fn` over the items with at most `limit` in flight (previews are read-only, so order doesn't matter). */
export async function mapWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      try {
        await fn(item)
      } catch {
        // each item reports its own failure
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
