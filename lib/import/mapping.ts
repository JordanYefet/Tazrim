/**
 * Column mapping for exports that have no built-in parser (ENG-23).
 *
 * A mapping says where the header is, which column holds which field, where a
 * card's billing date comes from, and how dates and numbers are written. It
 * turns a RawSheet (lib/parsers/raw-grid) into the same ParsedCCTransaction /
 * ParsedBankTransaction rows the dedicated parsers produce, so the upsert and
 * de-dup paths are shared. Pure and dependency-free: the upload page runs it in
 * the browser for the live preview, and the import runs it on the server.
 *
 * Which rows are data: from the row after the header (or `startRow`) to
 * `endRow`. Blank rows are always skipped. A row whose date cell is not a date
 * (a footer, a total, a sub-header) is skipped too while `skipInvalid` is on;
 * any other bad cell is reported as an error for that row.
 */
import type { RawCell, RawSheet } from '@/lib/parsers/raw-grid'
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'

export type MappingKind = 'card' | 'bank'

export const CARD_FIELDS = [
  'transactionDate',
  'billingDate',
  'merchant',
  'chargedAmount',
  'originalAmount',
  'originalCurrency',
  'category',
  'cardLastFour',
  'transactionType',
  'notes',
] as const
export const BANK_FIELDS = ['date', 'description', 'debit', 'credit', 'amount', 'balance', 'note'] as const

export type CardField = (typeof CARD_FIELDS)[number]
export type BankField = (typeof BANK_FIELDS)[number]
export type MappingField = CardField | BankField

export const FIELD_LABELS: Record<MappingField, string> = {
  transactionDate: 'תאריך עסקה',
  billingDate: 'תאריך חיוב',
  merchant: 'בית עסק',
  chargedAmount: 'סכום חיוב',
  originalAmount: 'סכום עסקה',
  originalCurrency: 'מטבע',
  category: 'קטגוריה',
  cardLastFour: '4 ספרות',
  transactionType: 'סוג עסקה',
  notes: 'הערות',
  date: 'תאריך',
  description: 'תיאור',
  debit: 'חובה',
  credit: 'זכות',
  amount: 'סכום',
  balance: 'יתרה',
  note: 'הערה',
}

export const DATE_FORMATS = [
  'auto',
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'DD/MM/YY',
  'DD.MM.YY',
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'excel',
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

export interface NumberFormat {
  decimal: '.' | ','
  thousands: ',' | '.' | ' ' | ''
}

export type BillingDateSource =
  | { from: 'column' }
  /** A date inside one cell, e.g. "עסקאות לחיוב ב-10/01/2030". `pattern`: a regex whose group 1 is the date */
  | { from: 'cell'; row: number; col: number; pattern?: string }
  /** YYYY-MM-DD */
  | { from: 'fixed'; date: string }

export interface ImportMapping {
  /** Sheet index in the workbook */
  sheet: number
  /** 0-based row of the header */
  headerRow: number
  /** First data row (default: the row after the header) */
  startRow?: number
  /** Last data row, inclusive (default: the end of the sheet) */
  endRow?: number
  /** Skip rows whose date cell is not a date (footers, totals) instead of reporting them */
  skipInvalid: boolean
  /** field -> 0-based column */
  columns: Partial<Record<MappingField, number>>
  /** Cards only */
  billingDate?: BillingDateSource
  /** Banks only: separate debit/credit columns, or one signed amount */
  amountMode?: 'split' | 'signed'
  /**
   * Cards: charges are negative in the file (they are stored positive).
   * Banks with a signed amount: negative means money out (debit).
   */
  expensesNegative: boolean
  dateFormat: DateFormat
  number: NumberFormat
}

export interface MappingError {
  /** 0-based sheet row */
  row: number
  field: MappingField
  message: string
}

export type RowOutcome<T> =
  | { row: number; status: 'ok'; tx: T }
  | { row: number; status: 'error'; errors: MappingError[] }
  | { row: number; status: 'skipped'; reason: 'blank' | 'invalid' }

export interface MappingResult<T> {
  rows: T[]
  /** Sheet row of each entry in `rows` */
  rowNumbers: number[]
  errors: MappingError[]
  /** Blank rows and rows without a date (when skipInvalid) */
  skipped: number
  outcomes: RowOutcome<T>[]
}

export type ParsedFor<K extends MappingKind> = K extends 'card' ? ParsedCCTransaction : ParsedBankTransaction

// ---------------------------------------------------------------------------
// Text, dates, numbers

/** Header text as compared and stored: whitespace and line breaks collapsed, Hebrew gershayim as a quote. */
export function normalizeHeader(value: RawCell | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The normalized header cells of `headerRow`, joined with "|" (trailing empty cells dropped). */
export function headerSignature(sheet: Pick<RawSheet, 'rows'>, headerRow: number): string {
  const cells = (sheet.rows[headerRow] ?? []).map(normalizeHeader)
  while (cells.length && cells[cells.length - 1] === '') cells.pop()
  return cells.join('|')
}

function localDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/
const DMY = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/

const fullYear = (y: string) => (y.length === 2 ? (Number(y) < 70 ? 2000 : 1900) + Number(y) : Number(y))

/** Excel's day 0 is 1899-12-30 (the 1900 leap-year bug only matters before March 1900). */
function fromSerial(n: number): Date | null {
  if (!Number.isInteger(Math.floor(n)) || n < 1 || n >= 2958466) return null
  const d = new Date(1899, 11, 30 + Math.floor(n))
  return isNaN(d.getTime()) ? null : d
}

/** A plausible Excel serial for a statement date (1955–2173): rules out amounts like 12.75 */
const isSerialDate = (n: number) => Number.isFinite(n) && n >= 20000 && n < 100000 && Number.isInteger(n)

/**
 * A cell as a date at local midnight (the parsers' convention), or null.
 * Real date cells arrive as ISO text from the raw grid and are always accepted.
 */
export function parseDate(value: RawCell | undefined, format: DateFormat): Date | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return (format === 'auto' || format === 'excel') && isSerialDate(value) ? fromSerial(value) : null
  }
  const s = value.replace(/[‎‏‪-‮]/g, '').trim()
  const iso = ISO.exec(s)
  if (iso) return localDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  if (format === 'excel') return /^\d+$/.test(s) && isSerialDate(Number(s)) ? fromSerial(Number(s)) : null
  if (format === 'YYYY-MM-DD') return null
  const m = DMY.exec(s)
  if (!m) return null
  const [, a, sep, b, y] = m
  if (format !== 'auto') {
    const want = format.charAt(2)
    const yearLen = format.endsWith('YYYY') ? 4 : 2
    if (sep !== want || y.length !== yearLen) return null
    if (format === 'MM/DD/YYYY') return localDate(fullYear(y), Number(a), Number(b))
  }
  return localDate(fullYear(y), Number(b), Number(a))
}

const CURRENCY = /₪|\$|€|£|ש"ח|ש״ח|שח|nis|ils|usd|eur|gbp/gi

/** A cell as a number, honouring the separators; null when empty or not a number. */
export function parseAmount(value: RawCell | undefined, format: NumberFormat): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = value.replace(/[‎‏‪-‮]/g, '').replace(CURRENCY, '').replace(/−/g, '-').trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1).trim()
  } else if (s.endsWith('-')) {
    negative = !negative
    s = s.slice(0, -1).trim()
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim()
  }
  if (format.thousands === ' ') s = s.replace(/[\s  ]/g, '')
  else if (format.thousands) s = s.split(format.thousands).join('')
  s = s.replace(/\s/g, '')
  if (format.decimal === ',') s = s.replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null
  const n = Number(s)
  return negative ? -n : n
}

const text = (v: RawCell | undefined) => (v === null || v === undefined ? '' : String(v).trim())

const DATE_IN_TEXT = /(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2}))/

/** The date inside a cell's text (or the cell itself when it is a date). */
export function dateFromCell(value: RawCell | undefined, pattern?: string): Date | null {
  if (value === null || value === undefined) return null
  const direct = parseDate(value, 'auto')
  if (direct) return direct
  if (typeof value !== 'string') return null
  let m: RegExpExecArray | null = null
  if (pattern) {
    try {
      m = new RegExp(pattern, 'u').exec(value)
    } catch {
      return null
    }
  } else {
    m = DATE_IN_TEXT.exec(value)
  }
  return m?.[1] ? parseDate(m[1], 'auto') : null
}

// ---------------------------------------------------------------------------
// Required fields

export function requiredFields(mapping: Pick<ImportMapping, 'billingDate' | 'amountMode'>, kind: MappingKind): MappingField[] {
  if (kind === 'card') {
    const req: MappingField[] = ['transactionDate', 'merchant', 'chargedAmount']
    if (!mapping.billingDate || mapping.billingDate.from === 'column') req.push('billingDate')
    return req
  }
  return ['date', 'description', ...(mapping.amountMode === 'signed' ? (['amount'] as const) : (['debit'] as const))]
}

/** Required fields with no column. Bank split mode needs debit or credit (reported as "debit"). */
export function missingFields(
  mapping: Pick<ImportMapping, 'columns' | 'billingDate' | 'amountMode'>,
  kind: MappingKind
): MappingField[] {
  const has = (f: MappingField) => mapping.columns[f] !== undefined
  return requiredFields(mapping, kind).filter(f =>
    kind === 'bank' && f === 'debit' ? !has('debit') && !has('credit') : !has(f)
  )
}

export function fieldsFor(kind: MappingKind): readonly MappingField[] {
  return kind === 'card' ? CARD_FIELDS : BANK_FIELDS
}

// ---------------------------------------------------------------------------
// applyMapping

const ERR = {
  date: 'תאריך לא תקין',
  empty: 'ערך חובה חסר',
  amount: 'סכום לא תקין',
  noAmount: 'אין סכום בחובה או בזכות',
  billing: 'לא נמצא תאריך חיוב בתא שנבחר',
  fixed: 'תאריך החיוב אינו תקין',
}

function isBlank(row: RawCell[] | undefined): boolean {
  return !row || row.every(c => c === null || (typeof c === 'string' && c.trim() === ''))
}

/** Billing date for every row when it does not come from a column; an error when it can't be read. */
function sharedBillingDate(sheet: RawSheet, source: BillingDateSource | undefined): Date | MappingError | null {
  if (!source || source.from === 'column') return null
  if (source.from === 'fixed') {
    return parseDate(source.date, 'YYYY-MM-DD') ?? { row: -1, field: 'billingDate', message: ERR.fixed }
  }
  return (
    dateFromCell(sheet.rows[source.row]?.[source.col], source.pattern) ?? {
      row: source.row,
      field: 'billingDate',
      message: ERR.billing,
    }
  )
}

export function applyMapping<K extends MappingKind>(
  sheet: RawSheet,
  mapping: ImportMapping,
  kind: K,
  opts: { fileName?: string; limit?: number } = {}
): MappingResult<ParsedFor<K>> {
  const result: MappingResult<ParsedFor<K>> = { rows: [], rowNumbers: [], errors: [], skipped: 0, outcomes: [] }
  const missing = missingFields(mapping, kind)
  if (missing.length) {
    result.errors = missing.map(field => ({ row: -1, field, message: 'לא נבחרה עמודה' }))
    return result
  }

  let billing: Date | null = null
  if (kind === 'card') {
    const shared = sharedBillingDate(sheet, mapping.billingDate)
    if (shared && !(shared instanceof Date)) {
      result.errors = [shared]
      return result
    }
    billing = shared
  }

  const col = (row: RawCell[], f: MappingField) => {
    const c = mapping.columns[f]
    return c === undefined ? undefined : row[c]
  }
  const start = Math.max(mapping.startRow ?? mapping.headerRow + 1, 0)
  const end = Math.min(mapping.endRow ?? sheet.rows.length - 1, sheet.rows.length - 1)
  const dateField: MappingField = kind === 'card' ? 'transactionDate' : 'date'

  for (let r = start; r <= end; r++) {
    if (opts.limit !== undefined && result.outcomes.length >= opts.limit) break
    const row = sheet.rows[r]
    if (isBlank(row)) {
      result.skipped++
      result.outcomes.push({ row: r, status: 'skipped', reason: 'blank' })
      continue
    }
    const date = parseDate(col(row, dateField), mapping.dateFormat)
    if (!date && mapping.skipInvalid) {
      result.skipped++
      result.outcomes.push({ row: r, status: 'skipped', reason: 'invalid' })
      continue
    }

    const errors: MappingError[] = []
    const fail = (field: MappingField, message: string) => errors.push({ row: r, field, message })
    if (!date) fail(dateField, ERR.date)

    const required = (f: MappingField) => {
      const v = text(col(row, f))
      if (!v) fail(f, ERR.empty)
      return v
    }
    /** null: empty; NaN: present but not a number (reported) */
    const amount = (f: MappingField, isRequired: boolean): number | null => {
      const raw = col(row, f)
      if (raw === undefined || raw === null || text(raw) === '') {
        if (isRequired) fail(f, ERR.empty)
        return null
      }
      const n = parseAmount(raw, mapping.number)
      if (n === null) {
        fail(f, ERR.amount)
        return NaN
      }
      return n
    }

    let tx: ParsedCCTransaction | ParsedBankTransaction | null = null
    if (kind === 'card') {
      let billingDate = billing
      if (!billingDate) {
        billingDate = parseDate(col(row, 'billingDate'), mapping.dateFormat)
        if (!billingDate) fail('billingDate', text(col(row, 'billingDate')) ? ERR.date : ERR.empty)
      }
      const merchant = required('merchant')
      const sign = mapping.expensesNegative ? -1 : 1
      const charged = amount('chargedAmount', true)
      const original = amount('originalAmount', false)
      if (!errors.length && date && billingDate && charged !== null) {
        tx = {
          transactionDate: date,
          billingDate,
          originalMerchantName: merchant,
          merchantName: merchant,
          category: text(col(row, 'category')),
          chargedAmount: sign * charged,
          originalAmount: sign * (original ?? charged),
          originalCurrency: text(col(row, 'originalCurrency')) || '₪',
          cardLastFour: text(col(row, 'cardLastFour')),
          transactionType: text(col(row, 'transactionType')),
          notes: text(col(row, 'notes')),
          cardProvider: 'MAPPED',
        }
      }
    } else {
      const description = required('description')
      let debit = 0
      let credit = 0
      if (mapping.amountMode === 'signed') {
        const n = amount('amount', true)
        if (n !== null && !isNaN(n)) {
          const out = mapping.expensesNegative ? n < 0 : n > 0
          if (out) debit = Math.abs(n)
          else credit = Math.abs(n)
        }
      } else {
        const d = amount('debit', false)
        const c = amount('credit', false)
        if (d === null && c === null) fail(mapping.columns.debit !== undefined ? 'debit' : 'credit', ERR.noAmount)
        debit = d && !isNaN(d) ? Math.abs(d) : 0
        credit = c && !isNaN(c) ? Math.abs(c) : 0
      }
      const balance = amount('balance', false)
      if (!errors.length && date) {
        tx = {
          date,
          originalDescription: description,
          description,
          debit,
          credit,
          balance: balance ?? 0,
          note: text(col(row, 'note')),
          sourceFile: opts.fileName ?? '',
        }
      }
    }

    if (tx) {
      result.rows.push(tx as ParsedFor<K>)
      result.rowNumbers.push(r)
      result.outcomes.push({ row: r, status: 'ok', tx: tx as ParsedFor<K> })
    } else {
      result.errors.push(...errors)
      result.outcomes.push({ row: r, status: 'error', errors })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// suggestMapping

const SYNONYMS: Record<MappingKind, Partial<Record<MappingField, string[]>>> = {
  card: {
    transactionDate: ['תאריך עסקה', 'תאריך העסקה', 'תאריך רכישה', 'תאריך הרכישה', 'תאריך ביצוע', 'תאריך ביצוע העסקה', 'transaction date', 'purchase date', 'date'],
    billingDate: ['תאריך חיוב', 'תאריך החיוב', 'מועד חיוב', 'מועד החיוב', 'billing date', 'charge date'],
    merchant: ['שם בית עסק', 'שם בית העסק', 'בית עסק', 'בית העסק', 'שם העסק', 'שם בעסק', 'merchant', 'merchant name', 'description'],
    chargedAmount: ['סכום חיוב', 'סכום החיוב', 'סכום לחיוב', 'סכום חיוב בש"ח', 'charged amount', 'charge amount', 'amount'],
    originalAmount: ['סכום עסקה', 'סכום העסקה', 'סכום עסקה מקורי', 'סכום מקורי', 'סכום קנייה', 'original amount', 'transaction amount'],
    originalCurrency: ['מטבע עסקה מקורי', 'מטבע עסקה', 'מטבע מקורי', 'מטבע', 'currency', 'original currency'],
    category: ['ענף', 'קטגוריה', 'ענף פעילות', 'category', 'sector'],
    cardLastFour: ['4 ספרות אחרונות של כרטיס האשראי', '4 ספרות אחרונות', 'ספרות אחרונות', 'כרטיס', 'card', 'last 4'],
    transactionType: ['סוג עסקה', 'סוג העסקה', 'סוג', 'type', 'transaction type'],
    notes: ['הערות', 'הערה', 'פירוט נוסף', 'פרטים', 'notes', 'details'],
  },
  bank: {
    date: ['תאריך', 'תאריך פעולה', 'תאריך תנועה', 'תאריך עסקה', 'date'],
    description: ['תיאור', 'תאור', 'תיאור התנועה', 'תיאור הפעולה', 'הפעולה', 'פירוט', 'description', 'details'],
    debit: ['בחובה', 'חובה', 'חיוב', 'debit'],
    credit: ['בזכות', 'זכות', 'זיכוי', 'credit'],
    amount: ['סכום', 'סכום בש"ח', 'סכום התנועה', 'amount'],
    balance: ['היתרה בש"ח', 'יתרה בש"ח', 'יתרה', 'היתרה', 'balance'],
    note: ['הערה', 'הערות', 'note', 'notes'],
  },
}

const LOOKUP: Record<MappingKind, Map<string, MappingField>> = {
  card: new Map(),
  bank: new Map(),
}
for (const kind of ['card', 'bank'] as const) {
  for (const [field, words] of Object.entries(SYNONYMS[kind]) as [MappingField, string[]][]) {
    for (const w of words) if (!LOOKUP[kind].has(normalizeHeader(w))) LOOKUP[kind].set(normalizeHeader(w), field)
  }
}

/** The field a header cell names, if any. */
export function fieldForHeader(value: RawCell | undefined, kind: MappingKind): MappingField | undefined {
  return LOOKUP[kind].get(normalizeHeader(value))
}

const HEADER_SCAN_ROWS = 40

/** First row with at least 3 text cells naming known fields; -1 when none. */
export function findHeaderRow(sheet: Pick<RawSheet, 'rows'>, kind: MappingKind): number {
  const limit = Math.min(sheet.rows.length, HEADER_SCAN_ROWS)
  for (let r = 0; r < limit; r++) {
    const hits = sheet.rows[r].filter(c => typeof c === 'string' && fieldForHeader(c, kind)).length
    if (hits >= 3) return r
  }
  return -1
}

/** "לחיוב ב-10/01/2030", or any "חיוב … DD/MM/YYYY", in the rows above the header. */
export function findBillingDateCell(sheet: Pick<RawSheet, 'rows'>, headerRow: number): { row: number; col: number } | null {
  for (let r = 0; r < headerRow; r++) {
    const row = sheet.rows[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const v = row[c]
      if (typeof v === 'string' && /חיוב/.test(v) && dateFromCell(v)) return { row: r, col: c }
    }
  }
  return null
}

const DEFAULT_NUMBER: NumberFormat = { decimal: '.', thousands: ',' }

/** Comma decimals ("1.234,56" / "12,5") when most text amounts look like that. */
function guessNumberFormat(values: RawCell[]): NumberFormat {
  let comma = 0
  let dot = 0
  for (const v of values) {
    if (typeof v !== 'string') continue
    if (/\d,\d{1,2}(?!\d)\s*\S*$/.test(v) && !/\d\.\d{1,2}(?!\d)/.test(v.split(',').pop() ?? '')) comma++
    else if (/\d\.\d{1,2}(?!\d)/.test(v)) dot++
  }
  return comma > dot ? { decimal: ',', thousands: '.' } : DEFAULT_NUMBER
}

/**
 * Best-effort mapping for an unknown file: the header row, the columns its
 * header names, the billing-date source and the number format.
 */
export function suggestMapping(sheet: RawSheet, kind: MappingKind, sheetIndex = 0): ImportMapping {
  const found = findHeaderRow(sheet, kind)
  const headerRow = found === -1 ? 0 : found
  const columns: Partial<Record<MappingField, number>> = {}
  ;(sheet.rows[headerRow] ?? []).forEach((cell, c) => {
    const field = fieldForHeader(cell, kind)
    if (field && columns[field] === undefined) columns[field] = c
  })

  const data = sheet.rows.slice(headerRow + 1, headerRow + 1 + 200)
  const valuesOf = (f: MappingField) => (columns[f] === undefined ? [] : data.map(r => r[columns[f]!]))
  const amountField: MappingField = kind === 'card' ? 'chargedAmount' : columns.amount !== undefined ? 'amount' : 'debit'
  const number = guessNumberFormat(valuesOf(amountField))
  const amounts = valuesOf(amountField)
    .map(v => parseAmount(v, number))
    .filter((n): n is number => n !== null && n !== 0)
  const negatives = amounts.filter(n => n < 0).length

  const mapping: ImportMapping = {
    sheet: sheetIndex,
    headerRow,
    skipInvalid: true,
    columns,
    expensesNegative: false,
    dateFormat: 'auto',
    number,
  }
  if (kind === 'card') {
    const cell = columns.billingDate === undefined ? findBillingDateCell(sheet, headerRow) : null
    mapping.billingDate = cell ? { from: 'cell', row: cell.row, col: cell.col } : { from: 'column' }
    // Card files list charges positive; a file where most amounts are negative lists them negative
    mapping.expensesNegative = amounts.length > 0 && negatives > amounts.length / 2
  } else {
    const signed = columns.debit === undefined && columns.credit === undefined && columns.amount !== undefined
    mapping.amountMode = signed ? 'signed' : 'split'
    // A signed bank amount is nearly always negative for money out
    mapping.expensesNegative = signed
  }
  if (kind === 'bank' && mapping.amountMode === 'split') delete columns.amount
  return mapping
}

// ---------------------------------------------------------------------------
// validateMapping: never trust a mapping that came from a client or the DB

export const MAX_COLUMN = 511
export const MAX_ROW = 1_000_000
export const MAX_PATTERN = 200

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIndex = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max

export type ValidateResult = { ok: true; mapping: ImportMapping } | { ok: false; error: string }

/** Checks shape, ranges and required fields; returns a clean copy with only known keys. */
export function validateMapping(input: unknown, kind: MappingKind): ValidateResult {
  const fail = (error: string): ValidateResult => ({ ok: false, error })
  if (!isObj(input)) return fail('מיפוי לא תקין')
  const { sheet = 0, headerRow, startRow, endRow, skipInvalid, columns, billingDate, amountMode, expensesNegative, dateFormat, number } = input

  if (!isIndex(sheet, 255)) return fail('גיליון לא תקין')
  if (!isIndex(headerRow, MAX_ROW)) return fail('שורת כותרת לא תקינה')
  if (startRow !== undefined && (!isIndex(startRow, MAX_ROW) || startRow <= headerRow)) return fail('שורת התחלה לא תקינה')
  if (endRow !== undefined && (!isIndex(endRow, MAX_ROW) || endRow < ((startRow as number | undefined) ?? headerRow + 1)))
    return fail('שורת סיום לא תקינה')
  if (typeof skipInvalid !== 'boolean' || typeof expensesNegative !== 'boolean') return fail('מיפוי לא תקין')
  if (typeof dateFormat !== 'string' || !(DATE_FORMATS as readonly string[]).includes(dateFormat)) return fail('תבנית תאריך לא נתמכת')
  if (
    !isObj(number) ||
    (number.decimal !== '.' && number.decimal !== ',') ||
    ![',', '.', ' ', ''].includes(number.thousands as string) ||
    number.decimal === number.thousands
  )
    return fail('תבנית מספרים לא תקינה')

  if (!isObj(columns)) return fail('מיפוי עמודות לא תקין')
  const allowed = fieldsFor(kind) as readonly string[]
  const clean: Partial<Record<MappingField, number>> = {}
  const used = new Set<number>()
  for (const [field, c] of Object.entries(columns)) {
    if (!allowed.includes(field)) return fail(`שדה לא מוכר: ${field}`)
    if (c === undefined || c === null) continue
    if (!isIndex(c, MAX_COLUMN)) return fail('מספר עמודה לא תקין')
    if (used.has(c)) return fail('אותה עמודה נבחרה לשני שדות')
    used.add(c)
    clean[field as MappingField] = c
  }

  const mapping: ImportMapping = {
    sheet,
    headerRow,
    ...(startRow !== undefined ? { startRow: startRow as number } : {}),
    ...(endRow !== undefined ? { endRow: endRow as number } : {}),
    skipInvalid,
    columns: clean,
    expensesNegative,
    dateFormat: dateFormat as DateFormat,
    number: { decimal: number.decimal as NumberFormat['decimal'], thousands: number.thousands as NumberFormat['thousands'] },
  }

  if (kind === 'card') {
    if (!isObj(billingDate)) return fail('חסר מקור לתאריך החיוב')
    if (billingDate.from === 'column') mapping.billingDate = { from: 'column' }
    else if (billingDate.from === 'cell') {
      const { row, col, pattern } = billingDate
      if (!isIndex(row, MAX_ROW) || !isIndex(col, MAX_COLUMN)) return fail('תא תאריך החיוב לא תקין')
      if (pattern !== undefined) {
        if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN) return fail('תבנית תאריך החיוב לא תקינה')
        try {
          new RegExp(pattern, 'u')
        } catch {
          return fail('תבנית תאריך החיוב לא תקינה')
        }
      }
      mapping.billingDate = { from: 'cell', row, col, ...(pattern !== undefined ? { pattern: pattern as string } : {}) }
    } else if (billingDate.from === 'fixed') {
      if (typeof billingDate.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(billingDate.date) || !parseDate(billingDate.date, 'YYYY-MM-DD'))
        return fail('תאריך החיוב אינו תקין')
      mapping.billingDate = { from: 'fixed', date: billingDate.date }
    } else return fail('חסר מקור לתאריך החיוב')
  } else {
    if (amountMode !== 'split' && amountMode !== 'signed') return fail('מצב סכום לא תקין')
    mapping.amountMode = amountMode
  }

  const missing = missingFields(mapping, kind)
  if (missing.length) return fail(`חסרות עמודות חובה: ${missing.map(f => FIELD_LABELS[f]).join(', ')}`)
  return { ok: true, mapping }
}

/** Account kind -> mapping kind; null for kinds without a mapper. */
export function mappingKindOf(accountKind: string): MappingKind | null {
  return accountKind === 'CREDIT_CARD' ? 'card' : accountKind === 'BANK' ? 'bank' : null
}
