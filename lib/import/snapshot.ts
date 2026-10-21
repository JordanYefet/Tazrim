/**
 * The header row (and a few sample rows) a saved mapping was made on (ENG-69),
 * stored on ImportProfile.headers, so the mapping can be opened and edited
 * without uploading a file. The samples are the user's own rows and stay in
 * the local database; they are never logged.
 *
 * In the file-less mapper the snapshot is laid out as a sheet again
 * (snapshotSheet): blank rows down to the mapping's header row, the header,
 * then the samples, so every row and column index of the mapping still means
 * the same thing.
 */
import type { RawCell, RawSheet } from '@/lib/parsers/raw-grid'
import { applyMapping, headerSignature, MAX_COLUMN, MAX_ROW, type ImportMapping, type MappingKind } from './mapping'

export interface HeaderSnapshot {
  v: 1
  /** The header row's cells, in column order */
  header: RawCell[]
  /** A few data rows below it, for the preview (may be empty) */
  samples: RawCell[][]
  /** Cells above the header the mapping reads (a card's billing-date cell) */
  cells?: { row: number; col: number; value: RawCell }[]
  /** Rebuilt from headerSignature for a profile saved before ENG-69: no samples, normalized text */
  rebuilt?: boolean
}

export const SAMPLE_ROWS = 5
export const MAX_CELL_CHARS = 200
const MAX_CELLS_ABOVE = 4

const clip = (v: RawCell | undefined): RawCell => {
  if (v === undefined || v === null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return v.length > MAX_CELL_CHARS ? v.slice(0, MAX_CELL_CHARS) : v
}

function trimRow(row: RawCell[] | undefined): RawCell[] {
  const out = (row ?? []).slice(0, MAX_COLUMN + 1).map(clip)
  while (out.length && out[out.length - 1] === null) out.pop()
  return out
}

const isBlank = (row: RawCell[] | undefined) => !row || row.every(c => c === null || (typeof c === 'string' && !c.trim()))

/**
 * The snapshot of `sheet` for `mapping`: its header row, the first rows that
 * map cleanly (else the first non-blank ones), and the billing-date cell.
 */
export function buildSnapshot(sheet: Pick<RawSheet, 'rows'>, mapping: ImportMapping, kind: MappingKind): HeaderSnapshot {
  const header = trimRow(sheet.rows[mapping.headerRow])
  const asSheet = sheet as RawSheet
  const ok = applyMapping(asSheet, mapping, kind, { limit: 50 }).rowNumbers.slice(0, SAMPLE_ROWS)
  const start = mapping.startRow ?? mapping.headerRow + 1
  const rows = ok.length
    ? ok
    : sheet.rows
        .map((r, i) => (i >= start && !isBlank(r) ? i : -1))
        .filter(i => i >= 0)
        .slice(0, SAMPLE_ROWS)
  const snapshot: HeaderSnapshot = { v: 1, header, samples: rows.map(r => trimRow(sheet.rows[r])) }
  const b = mapping.billingDate
  if (kind === 'card' && b?.from === 'cell' && b.row < mapping.headerRow) {
    snapshot.cells = [{ row: b.row, col: b.col, value: clip(sheet.rows[b.row]?.[b.col]) }]
  }
  return snapshot
}

/** A header-only snapshot from a profile's headerSignature (pre-ENG-69 profiles); null when empty. */
export function snapshotFromSignature(signature: string): HeaderSnapshot | null {
  if (!signature.trim()) return null
  return { v: 1, header: signature.split('|').map(h => h || null), samples: [], rebuilt: true }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCell = (v: unknown): v is RawCell =>
  v === null || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= MAX_CELL_CHARS)
const isRow = (v: unknown): v is RawCell[] => Array.isArray(v) && v.length <= MAX_COLUMN + 1 && v.every(isCell)
const isIndex = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max

export type SnapshotResult = { ok: true; snapshot: HeaderSnapshot } | { ok: false; error: string }

/** Never trust a snapshot from the client or the DB: shape, sizes, and a clean copy. */
export function validateSnapshot(input: unknown): SnapshotResult {
  const fail = (): SnapshotResult => ({ ok: false, error: 'כותרות הקובץ אינן תקינות' })
  if (!isObj(input) || input.v !== 1) return fail()
  const { header, samples, cells, rebuilt } = input
  if (!isRow(header) || !header.length) return fail()
  if (!Array.isArray(samples) || samples.length > SAMPLE_ROWS || !samples.every(isRow)) return fail()
  const snapshot: HeaderSnapshot = { v: 1, header: [...header], samples: samples.map(r => [...r]) }
  if (cells !== undefined) {
    if (
      !Array.isArray(cells) ||
      cells.length > MAX_CELLS_ABOVE ||
      !cells.every(c => isObj(c) && isIndex(c.row, MAX_ROW) && isIndex(c.col, MAX_COLUMN) && isCell(c.value))
    )
      return fail()
    snapshot.cells = cells.map(c => ({ row: c.row as number, col: c.col as number, value: c.value as RawCell }))
  }
  if (rebuilt === true) snapshot.rebuilt = true
  return { ok: true, snapshot }
}

/** ImportProfile.headers parsed and checked; null when absent or not a valid snapshot. */
export function parseSnapshot(json: string | null | undefined): HeaderSnapshot | null {
  if (!json) return null
  try {
    const res = validateSnapshot(JSON.parse(json))
    return res.ok ? res.snapshot : null
  } catch {
    return null
  }
}

/** The snapshot's header signature: what a file must have to match the profile. */
export function snapshotSignature(snapshot: Pick<HeaderSnapshot, 'header'>): string {
  return headerSignature({ rows: [snapshot.header] }, 0)
}

/** The snapshot without its sample rows (the header stays editable). */
export function withoutSamples(snapshot: HeaderSnapshot): HeaderSnapshot {
  return { v: 1, header: snapshot.header, samples: [], ...(snapshot.rebuilt ? { rebuilt: true } : {}) }
}

/** The snapshot laid out as a sheet for `mapping`: header at its row, samples where the data starts. */
export function snapshotSheet(snapshot: HeaderSnapshot, mapping: Pick<ImportMapping, 'headerRow' | 'startRow'>, name = ''): RawSheet {
  const start = Math.max(mapping.startRow ?? mapping.headerRow + 1, mapping.headerRow + 1)
  const width = Math.max(snapshot.header.length, ...snapshot.samples.map(r => r.length), ...(snapshot.cells ?? []).map(c => c.col + 1))
  const blank = () => Array.from({ length: width }, () => null as RawCell)
  const pad = (row: RawCell[]) => [...row, ...Array.from({ length: width - row.length }, () => null)]
  const rows: RawCell[][] = Array.from({ length: start + snapshot.samples.length }, blank)
  for (const c of snapshot.cells ?? []) if (c.row < mapping.headerRow) rows[c.row][c.col] = c.value
  rows[mapping.headerRow] = pad(snapshot.header)
  snapshot.samples.forEach((r, i) => (rows[start + i] = pad(r)))
  return { name, rows, rowCount: rows.length, columnCount: width }
}
