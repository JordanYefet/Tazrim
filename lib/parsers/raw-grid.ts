/**
 * Provider-agnostic reader: turns any supported export into a rectangular
 * grid of cells, exactly as a spreadsheet would show it, so the user can look
 * at an unknown file before anything is mapped or saved.
 *
 * Cell values:
 *  - text                 -> trimmed string; empty / whitespace-only -> null
 *  - numeric xlsx/xls cell -> number (unformatted, e.g. 1234.5)
 *  - date-formatted cell  -> ISO string "YYYY-MM-DD", or "YYYY-MM-DD HH:mm"
 *                            when the cell's number format shows a time.
 *                            (ISO rather than the display text, so later steps
 *                            can parse dates without guessing a locale.)
 *  - boolean / error cell -> its display text
 *  - HTML and CSV         -> always the raw cell text (strings); dates there
 *                            are already text and are left untouched.
 *
 * Grids always start at A1 (so row/column labels match Excel), rows are
 * padded with null to `columnCount`, and trailing fully-empty rows/columns
 * are dropped. An empty sheet is `{ rows: [], rowCount: 0, columnCount: 0 }`.
 */
import * as XLSX from 'xlsx'
import {
  type BinaryInput,
  decodeText,
  readHtmlTables,
  readWorkbook,
  sniffFormat,
  toBuffer,
} from './file-readers'

export type RawCell = string | number | null

export type RawFormat = 'xlsx' | 'xls' | 'xls-html' | 'csv'

export interface RawSheet {
  name: string
  rows: RawCell[][]
  rowCount: number
  columnCount: number
}

export interface RawWorkbook {
  format: RawFormat
  sheets: RawSheet[]
}

export interface RawSheetPreview extends RawSheet {
  /** rows not included in `rows` (rowCount - rows.length) */
  omittedRowCount: number
}

export interface RawWorkbookPreview {
  format: RawFormat
  sheets: RawSheetPreview[]
}

export type RawGridErrorCode = 'EMPTY_FILE' | 'UNSUPPORTED_FORMAT' | 'CORRUPT_FILE'

export class RawGridError extends Error {
  readonly code: RawGridErrorCode
  constructor(code: RawGridErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RawGridError'
    this.code = code
  }
}

export function readRawGrid(input: BinaryInput, fileName: string): RawWorkbook {
  const buf = toBuffer(input)
  if (buf.length === 0) throw new RawGridError('EMPTY_FILE', `הקובץ ${fileName} ריק`)

  const format = sniffFormat(buf)
  switch (format) {
    case 'xlsx':
    case 'xls':
      return { format, sheets: readWorkbookSheets(buf, fileName) }
    case 'xls-html':
      return { format, sheets: [readHtmlSheet(buf, fileName)] }
    case 'csv':
      return { format, sheets: [readCsvSheet(buf, fileName)] }
    default:
      throw new RawGridError('UNSUPPORTED_FORMAT', `סוג הקובץ ${fileName} אינו נתמך`)
  }
}

/** Cap each sheet to its first `maxRows` rows for sending to the client. */
export function truncateWorkbook(wb: RawWorkbook, maxRows: number): RawWorkbookPreview {
  return {
    format: wb.format,
    sheets: wb.sheets.map(s => ({
      ...s,
      rows: s.rows.slice(0, maxRows),
      omittedRowCount: Math.max(0, s.rowCount - maxRows),
    })),
  }
}

// ---------------------------------------------------------------------------

function baseName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? fileName
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name) || 'Sheet1'
}

function normalizeText(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

/** Pad to a rectangle and drop trailing empty rows / columns. */
function toSheet(name: string, rawRows: RawCell[][]): RawSheet {
  let lastRow = -1
  let columnCount = 0
  rawRows.forEach((row, r) => {
    for (let c = row.length - 1; c >= 0; c--) {
      if (row[c] !== null && row[c] !== undefined) {
        lastRow = r
        columnCount = Math.max(columnCount, c + 1)
        break
      }
    }
  })
  const rows = rawRows.slice(0, lastRow + 1).map(row => {
    const out: RawCell[] = row.slice(0, columnCount).map(v => (v === undefined ? null : v))
    while (out.length < columnCount) out.push(null)
    return out
  })
  return { name, rows, rowCount: rows.length, columnCount }
}

// --- xlsx / xls ------------------------------------------------------------

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function formatShowsTime(fmt: string): boolean {
  const stripped = fmt.replace(/"[^"]*"/g, '').replace(/\\./g, '')
  return /[hs]/i.test(stripped.replace(/\[(?![hms]+\])[^\]]*\]/gi, ''))
}

function dateCodeToIso(serial: number, withTime: boolean): string | null {
  const d = XLSX.SSF.parse_date_code(serial)
  if (!d) return null
  const date = `${pad(d.y, 4)}-${pad(d.m)}-${pad(d.d)}`
  return withTime ? `${date} ${pad(d.H)}:${pad(d.M)}` : date
}

function cellValue(cell: XLSX.CellObject | undefined): RawCell {
  if (!cell) return null
  switch (cell.t) {
    case 'z':
      return null
    case 's':
      return normalizeText(String(cell.v ?? ''))
    case 'n': {
      const v = cell.v as number
      const fmt = typeof cell.z === 'string' ? cell.z : ''
      if (fmt && XLSX.SSF.is_date(fmt)) return dateCodeToIso(v, formatShowsTime(fmt)) ?? v
      return v
    }
    case 'd': {
      const d = cell.v instanceof Date ? cell.v : new Date(String(cell.v))
      if (isNaN(d.getTime())) return normalizeText(cell.w ?? '')
      const date = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      return d.getHours() || d.getMinutes() ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date
    }
    case 'b':
      return cell.w ?? (cell.v ? 'TRUE' : 'FALSE')
    case 'e':
      return cell.w ?? '#ERROR'
    default:
      return normalizeText(String(cell.w ?? cell.v ?? ''))
  }
}

function readWorkbookSheets(buf: Buffer, fileName: string): RawSheet[] {
  let workbook: XLSX.WorkBook
  try {
    workbook = readWorkbook(buf, { cellNF: true, cellDates: false })
  } catch (e) {
    throw new RawGridError('CORRUPT_FILE', `לא ניתן לקרוא את הקובץ ${fileName}`, { cause: e })
  }
  if (!workbook.SheetNames?.length) {
    throw new RawGridError('CORRUPT_FILE', `לא נמצאו גיליונות בקובץ ${fileName}`)
  }

  return workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name]
    const ref = ws?.['!ref']
    if (!ref) return toSheet(name, [])
    const range = XLSX.utils.decode_range(ref)
    const rows: RawCell[][] = []
    for (let r = 0; r <= range.e.r; r++) {
      const row: RawCell[] = []
      for (let c = 0; c <= range.e.c; c++) {
        row.push(r < range.s.r || c < range.s.c ? null : cellValue(ws[XLSX.utils.encode_cell({ r, c })]))
      }
      rows.push(row)
    }
    return toSheet(name, rows)
  })
}

// --- HTML disguised as .xls (Leumi) ----------------------------------------

function readHtmlSheet(buf: Buffer, fileName: string): RawSheet {
  // Excel shows every table of an HTML "xls" stacked on one sheet; do the same.
  const rows: RawCell[][] = []
  for (const table of readHtmlTables(decodeText(buf))) {
    for (const tr of table) {
      const row: RawCell[] = []
      for (const cell of tr) {
        row.push(normalizeText(cell.text))
        for (let i = 1; i < cell.colSpan; i++) row.push(null)
      }
      rows.push(row)
    }
  }
  return toSheet(baseName(fileName), rows)
}

// --- CSV --------------------------------------------------------------------

const DELIMITERS = [',', ';', '\t'] as const

function countOutsideQuotes(line: string, delim: string): number {
  let n = 0
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === delim && !quoted) n++
  }
  return n
}

/** Pick the delimiter that splits the first lines most consistently. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '').slice(0, 20)
  let best: string = ','
  let bestScore = 0
  let bestMode = 0
  for (const d of DELIMITERS) {
    const counts = lines.map(l => countOutsideQuotes(l, d))
    const freq = new Map<number, number>()
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1)
    let mode = 0
    let score = 0
    for (const [c, f] of freq) if (f > score || (f === score && c > mode)) { mode = c; score = f }
    if (score > bestScore || (score === bestScore && mode > bestMode)) {
      best = d
      bestScore = score
      bestMode = mode
    }
  }
  return best
}

function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false
      } else {
        field += ch
      }
      i++
      continue
    }
    if (ch === '"' && field.trim() === '') { quoted = true; field = ''; i++; continue }
    if (ch === delim) { row.push(field); field = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch
    i++
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function readCsvSheet(buf: Buffer, fileName: string): RawSheet {
  const text = decodeText(buf)
  const rows = parseCsv(text, detectDelimiter(text)).map(r => r.map(normalizeText))
  return toSheet(baseName(fileName), rows)
}
