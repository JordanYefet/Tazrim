'use client'

import { useId } from 'react'
import { AlertCircle, ChevronDown, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { columnLabel } from '@/lib/utils/column-label'
import { RawGridPreview, type GridRowTone } from './raw-grid-preview'
import type { RawSheet, RawWorkbookPreview } from '@/lib/parsers/raw-grid'
import {
  dateFromCell,
  DATE_FORMATS,
  FIELD_LABELS,
  findBillingDateCell,
  missingFields,
  normalizeHeader,
  requiredFields,
  suggestMapping,
  withHeaderRow,
  type DateFormat,
  type ImportMapping,
  type MappingField,
  type MappingKind,
  type NumberFormat,
} from '@/lib/import/mapping'
import { fieldOfColumn, selectableFields, setColumnField, type MappingCheck } from '@/lib/upload/mapping-state'
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'

const nf = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nfInt = new Intl.NumberFormat('he-IL')
const IGNORE = ''
const PREVIEW_ROWS = 20

const pad = (n: number) => String(n).padStart(2, '0')
/** DD/MM/YYYY */
export const formatDay = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: 'זיהוי אוטומטי',
  'DD/MM/YYYY': 'DD/MM/YYYY',
  'DD-MM-YYYY': 'DD-MM-YYYY',
  'DD.MM.YYYY': 'DD.MM.YYYY',
  'DD/MM/YY': 'DD/MM/YY',
  'DD.MM.YY': 'DD.MM.YY',
  'YYYY-MM-DD': 'YYYY-MM-DD',
  'MM/DD/YYYY': 'MM/DD/YYYY',
  excel: 'מספר סידורי של Excel',
}

const inputClass =
  'h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

function sheetOf(workbook: RawWorkbookPreview, mapping: ImportMapping): RawSheet | undefined {
  return workbook.sheets[mapping.sheet]
}

/**
 * Step 3, for every file: mark the header row on the
 * raw grid, pick a field per column, choose where a card's billing date comes
 * from, and (rarely) adjust formats. The parsed preview below updates live.
 */
export function ColumnMapper({
  workbook,
  kind,
  mapping,
  onChange,
  fileless = false,
}: {
  workbook: RawWorkbookPreview
  kind: MappingKind
  mapping: ImportMapping
  onChange: (next: ImportMapping) => void
  /**
   * ENG-69: `workbook` is the stored header (and sample rows) laid out as a
   * sheet, not a file: no grid or sheet picker, the header row is a number,
   * and each column shows its first sample value.
   */
  fileless?: boolean
}) {
  const id = useId()
  const sheet = sheetOf(workbook, mapping)
  const required = new Set(requiredFields(mapping, kind))
  // the billing date has its own section below, with its own message
  const missingColumns = missingFields(mapping, kind).filter(f => f !== 'billingDate')
  const fields = selectableFields(kind)

  function rowTone(r: number): GridRowTone | undefined {
    if (r === mapping.headerRow) return 'header'
    if (r < mapping.headerRow) return 'above'
    if (mapping.endRow !== undefined && r > mapping.endRow) return 'skipped'
    return undefined
  }

  function pickSheet(i: number) {
    const next = workbook.sheets[i]
    if (next) onChange({ ...suggestMapping(next, kind, i), dateFormat: mapping.dateFormat, number: mapping.number })
  }

  const sample = (c: number) => {
    if (!fileless || !sheet) return null
    for (let r = mapping.headerRow + 1; r < sheet.rows.length; r++) {
      const v = sheet.rows[r]?.[c]
      if (v !== null && v !== undefined && String(v).trim()) return String(v)
    }
    return null
  }

  return (
    <div className="min-w-0 space-y-5">
      {fileless ? (
        <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
          <Rows3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 text-pretty text-muted-foreground">
            העמודות כאן הן הכותרות השמורות במיפוי. אפשר לשנות מה יש בכל עמודה בלי להעלות קובץ.
          </p>
        </div>
      ) : (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          לחץ על מספר שורה כדי לסמן את <span className="font-medium text-foreground">שורת הכותרת</span>. השורות שמתחתיה הן העסקאות.
        </p>
        <RawGridPreview
          workbook={workbook}
          activeSheet={mapping.sheet}
          onSheetChange={pickSheet}
          onPickRow={r => sheet && onChange(withHeaderRow(sheet, mapping, kind, r))}
          rowTone={rowTone}
          columnTag={c => {
            const f = fieldOfColumn(mapping, c)
            return f ? FIELD_LABELS[f] : undefined
          }}
          maxHeightClass="max-h-[45vh]"
        />
      </div>
      )}

      {sheet && sheet.columnCount > 0 && (
        <fieldset id={MAPPER_ANCHORS.columns} className="min-w-0 scroll-mt-24 space-y-2">
          <legend className="mb-2 text-sm font-medium">מה יש בכל עמודה?</legend>
          {missingColumns.length > 0 && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-destructive/50 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive text-pretty">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                חסרות עמודות חובה: {missingColumns.map(f => FIELD_LABELS[f]).join(', ')}. בחר לכל אחת את העמודה שלה ברשימה למטה.
              </span>
            </p>
          )}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: sheet.columnCount }, (_, c) => {
              const header = normalizeHeader(sheet.rows[mapping.headerRow]?.[c] ?? null)
              const current = fieldOfColumn(mapping, c)
              const selectId = `${id}-col-${c}`
              return (
                <li
                  key={c}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
                    current ? 'border-primary/30 bg-primary/5' : 'bg-card'
                  )}
                >
                  <label htmlFor={selectId} className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-muted px-1 text-xs font-medium text-muted-foreground">
                      {columnLabel(c)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="min-w-0 truncate text-sm" dir="auto" title={header || undefined}>
                        {header || <span className="text-muted-foreground">ללא כותרת</span>}
                      </span>
                      {sample(c) !== null && (
                        <span className="min-w-0 truncate text-xs text-muted-foreground" dir="auto">
                          {sample(c)}
                        </span>
                      )}
                    </span>
                  </label>
                  <select
                    id={selectId}
                    value={current ?? IGNORE}
                    onChange={e => onChange(setColumnField(mapping, kind, c, (e.target.value || null) as MappingField | null))}
                    className={cn('w-36 shrink-0', !current && 'text-muted-foreground')}
                  >
                    <option value={IGNORE}>התעלם</option>
                    {fields.map(f => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f]}
                        {required.has(f) ? ' *' : ''}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">* שדה חובה</p>
        </fieldset>
      )}

      {kind === 'card' && sheet && <BillingDateSource sheet={sheet} mapping={mapping} onChange={onChange} />}

      <Advanced kind={kind} mapping={mapping} onChange={onChange} fileless={fileless} />
    </div>
  )
}

/** The highest header row the file-less mapper accepts (the stored header is laid out down to it) */
const MAX_FILELESS_HEADER_ROW = 200

/** Where the upload page scrolls to when something required is missing */
export const MAPPER_ANCHORS = { columns: 'mapper-columns', billing: 'mapper-billing' } as const

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function BillingDateSource({
  sheet,
  mapping,
  onChange,
}: {
  sheet: RawSheet
  mapping: ImportMapping
  onChange: (next: ImportMapping) => void
}) {
  const id = useId()
  const source = mapping.billingDate ?? { from: 'column' as const }
  const cell = source.from === 'cell' ? { row: source.row, col: source.col } : findBillingDateCell(sheet, mapping.headerRow)
  const cellDate = cell ? dateFromCell(sheet.rows[cell.row]?.[cell.col], source.from === 'cell' ? source.pattern : undefined) : null
  const hasColumn = mapping.columns.billingDate !== undefined
  const day = source.from === 'day' ? source.day : undefined
  const closesOn = source.from === 'day' ? source.closesOn : undefined
  const missing = (source.from === 'column' && !hasColumn) || (source.from === 'day' && day === undefined)

  const setDay = (next: { day?: number; closesOn?: number }) =>
    onChange({
      ...mapping,
      billingDate: {
        from: 'day',
        ...(next.day !== undefined ? { day: next.day } : {}),
        ...(next.closesOn !== undefined ? { closesOn: next.closesOn } : {}),
      },
    })

  const option = (value: 'column' | 'cell' | 'day', label: React.ReactNode, extra?: React.ReactNode) => (
    <label
      className={cn(
        'flex min-h-10 cursor-pointer flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border px-3 py-2 text-sm transition-colors',
        source.from === value ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      <input
        type="radio"
        name={`${id}-billing`}
        checked={source.from === value}
        onChange={() => {
          if (value === 'column') onChange({ ...mapping, billingDate: { from: 'column' } })
          if (value === 'cell' && cell) onChange({ ...mapping, billingDate: { from: 'cell', row: cell.row, col: cell.col } })
          if (value === 'day') setDay({ day, closesOn })
        }}
        className="accent-[hsl(var(--primary))]"
      />
      <span>{label}</span>
      {extra}
    </label>
  )

  return (
    <fieldset id={MAPPER_ANCHORS.billing} className="scroll-mt-24 space-y-2">
      <legend className={cn('mb-1 text-sm font-medium', missing && 'text-destructive')}>תאריך החיוב *</legend>
      <div className={cn('space-y-2', missing && 'rounded-xl border border-destructive/50 bg-destructive/[0.04] p-3')}>
      {missing ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive text-pretty">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {source.from === 'day'
              ? 'בחר באיזה יום בחודש הכרטיס מחויב. תאריך החיוב של כל עסקה ייקבע לפי תאריך הרכישה שלה.'
              : 'בקובץ אין עמודה של תאריך חיוב. בחר אותה ברשימת העמודות למעלה, או קבע באיזה יום בחודש הכרטיס מחויב.'}
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">החודש של כל עסקה בכרטיס נקבע לפי תאריך החיוב שלה.</p>
      )}
      <div className="grid gap-2">
        {option(
          'column',
          hasColumn ? (
            <>עמודה <span className="font-medium">{columnLabel(mapping.columns.billingDate!)}</span> בקובץ</>
          ) : (
            <>עמודה בקובץ <span className="text-xs text-muted-foreground">(בחר אותה למעלה)</span></>
          )
        )}
        {cell && cellDate &&
          option(
            'cell',
            <>
              מתוך שורת הכותרת: <span dir="ltr" className="font-medium tabular-nums">{formatDay(cellDate)}</span>
            </>
          )}
        {option(
          'day',
          'יום קבוע בכל חודש',
          source.from === 'day' && (
            <span className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 ps-6">
              <label className="flex items-center gap-2">
                <span>מחויב ב־</span>
                <select
                  aria-label="יום החיוב בחודש"
                  aria-invalid={day === undefined || undefined}
                  value={day ?? ''}
                  onChange={e => setDay({ day: e.target.value ? Number(e.target.value) : undefined, closesOn })}
                  className={cn('w-20', day === undefined && 'border-destructive text-muted-foreground')}
                >
                  <option value="">בחר</option>
                  {DAYS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <span>לחודש</span>
              </label>
              <label className="flex items-center gap-2">
                <span>המחזור נסגר ב־</span>
                <select
                  aria-label="יום סגירת המחזור"
                  value={closesOn ?? ''}
                  onChange={e => setDay({ day, closesOn: e.target.value ? Number(e.target.value) : undefined })}
                  className={cn('w-28', closesOn === undefined && 'text-muted-foreground')}
                >
                  <option value="">ביום החיוב</option>
                  {DAYS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <span className="w-full text-xs text-muted-foreground text-pretty">
                עסקה עד יום סגירת המחזור נכנסת לחיוב הקרוב, ואחריו לחיוב של החודש הבא. אפשר לראות אותו בדף הפירוט: התאריך של העסקה האחרונה
                שנכנסה לחיוב. בתשלומים (&quot;תשלום 3 מתוך 10&quot;) כל תשלום עובר לחודש שלו.
              </span>
            </span>
          )
        )}
      </div>
      </div>
    </fieldset>
  )
}

function Advanced({
  kind,
  mapping,
  onChange,
  fileless,
}: {
  kind: MappingKind
  mapping: ImportMapping
  onChange: (next: ImportMapping) => void
  fileless: boolean
}) {
  const id = useId()
  const setNumber = (patch: Partial<NumberFormat>) => {
    const number = { ...mapping.number, ...patch }
    // the two separators can't be the same character
    if (number.decimal === number.thousands) number.thousands = number.decimal === ',' ? '.' : ','
    onChange({ ...mapping, number })
  }
  const signed = kind === 'bank' && mapping.amountMode === 'signed'

  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        מתקדם
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-fast ease-out group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-date`} className="text-xs font-medium text-muted-foreground">תבנית תאריך</label>
          <select
            id={`${id}-date`}
            value={mapping.dateFormat}
            onChange={e => onChange({ ...mapping, dateFormat: e.target.value as DateFormat })}
            className="w-full"
          >
            {DATE_FORMATS.map(f => (
              <option key={f} value={f}>{DATE_FORMAT_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={`${id}-dec`} className="text-xs font-medium text-muted-foreground">נקודה עשרונית</label>
            <select
              id={`${id}-dec`}
              value={mapping.number.decimal}
              onChange={e => setNumber({ decimal: e.target.value as NumberFormat['decimal'] })}
              className="w-full"
            >
              <option value=".">נקודה (1.5)</option>
              <option value=",">פסיק (1,5)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-th`} className="text-xs font-medium text-muted-foreground">מפריד אלפים</label>
            <select
              id={`${id}-th`}
              value={mapping.number.thousands}
              onChange={e => setNumber({ thousands: e.target.value as NumberFormat['thousands'] })}
              className="w-full"
            >
              <option value=",">פסיק</option>
              <option value=".">נקודה</option>
              <option value=" ">רווח</option>
              <option value="">ללא</option>
            </select>
          </div>
        </div>

        {kind === 'bank' && (
          <div className="space-y-1">
            <label htmlFor={`${id}-mode`} className="text-xs font-medium text-muted-foreground">סכומים</label>
            <select
              id={`${id}-mode`}
              value={mapping.amountMode ?? 'split'}
              onChange={e => {
                const amountMode = e.target.value as 'split' | 'signed'
                const columns = { ...mapping.columns }
                if (amountMode === 'signed') {
                  const col = columns.debit ?? columns.credit
                  delete columns.debit
                  delete columns.credit
                  if (col !== undefined && columns.amount === undefined) columns.amount = col
                } else {
                  if (columns.amount !== undefined && columns.debit === undefined) columns.debit = columns.amount
                  delete columns.amount
                }
                onChange({ ...mapping, amountMode, columns, expensesNegative: amountMode === 'signed' ? true : mapping.expensesNegative })
              }}
              className="w-full"
            >
              <option value="split">עמודות חובה וזכות</option>
              <option value="signed">עמודת סכום אחת (עם סימן)</option>
            </select>
          </div>
        )}

        {fileless && (
          <div className="space-y-1">
            <label htmlFor={`${id}-header`} className="text-xs font-medium text-muted-foreground">שורת הכותרת בקובץ</label>
            <input
              id={`${id}-header`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_FILELESS_HEADER_ROW}
              value={mapping.headerRow + 1}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isInteger(n) || n < 1 || n > MAX_FILELESS_HEADER_ROW) return
                const headerRow = n - 1
                const next: ImportMapping = { ...mapping, headerRow }
                delete next.startRow
                if (next.endRow !== undefined && next.endRow <= headerRow) delete next.endRow
                const b = mapping.billingDate
                if (b?.from === 'cell' && b.row >= headerRow) next.billingDate = { from: 'column' }
                onChange(next)
              }}
              className={cn(inputClass, 'w-full')}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">אם הכותרת זזה בקובץ, היא תימצא לבד בייבוא.</p>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor={`${id}-end`} className="text-xs font-medium text-muted-foreground">שורה אחרונה (לא חובה)</label>
          <input
            id={`${id}-end`}
            type="number"
            inputMode="numeric"
            min={mapping.headerRow + 2}
            placeholder="עד סוף הגיליון"
            value={mapping.endRow === undefined ? '' : mapping.endRow + 1}
            onChange={e => {
              const n = parseInt(e.target.value, 10)
              const next = { ...mapping }
              if (Number.isInteger(n) && n - 1 > mapping.headerRow) next.endRow = n - 1
              else delete next.endRow
              onChange(next)
            }}
            className={cn(inputClass, 'w-full')}
            dir="ltr"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          {(kind === 'card' || signed) && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={mapping.expensesNegative}
                onChange={e => onChange({ ...mapping, expensesNegative: e.target.checked })}
                className="mt-1 accent-[hsl(var(--primary))]"
              />
              <span>
                {kind === 'card' ? 'חיובים מופיעים בקובץ כמספר שלילי' : 'סכום שלילי הוא חובה (כסף שיצא)'}
              </span>
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={mapping.skipInvalid}
              onChange={e => onChange({ ...mapping, skipInvalid: e.target.checked })}
              className="mt-1 accent-[hsl(var(--primary))]"
            />
            <span>דלג על שורות בלי תאריך (סיכומים, הערות בתחתית)</span>
          </label>
        </div>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------

type Col<T> = { field: MappingField; label: string; value: (t: T) => React.ReactNode; num?: boolean }

const money = (n: number) => <span dir="ltr" className="tabular-nums">{nf.format(n)}</span>

const CARD_COLS: Col<ParsedCCTransaction>[] = [
  { field: 'transactionDate', label: 'תאריך עסקה', value: t => <span dir="ltr" className="tabular-nums">{formatDay(t.transactionDate)}</span> },
  { field: 'billingDate', label: 'תאריך חיוב', value: t => <span dir="ltr" className="tabular-nums">{formatDay(t.billingDate)}</span> },
  { field: 'merchant', label: 'בית עסק', value: t => t.originalMerchantName },
  { field: 'chargedAmount', label: 'סכום חיוב', value: t => money(t.chargedAmount), num: true },
  { field: 'originalAmount', label: 'סכום עסקה', value: t => money(t.originalAmount), num: true },
  { field: 'transactionType', label: 'סוג', value: t => t.transactionType },
  { field: 'category', label: 'קטגוריה', value: t => t.category },
  { field: 'notes', label: 'הערות', value: t => t.notes },
]

const BANK_COLS: Col<ParsedBankTransaction>[] = [
  { field: 'date', label: 'תאריך', value: t => <span dir="ltr" className="tabular-nums">{formatDay(t.date)}</span> },
  { field: 'description', label: 'תיאור', value: t => t.description },
  { field: 'debit', label: 'חובה', value: t => (t.debit ? money(t.debit) : ''), num: true },
  { field: 'credit', label: 'זכות', value: t => (t.credit ? money(t.credit) : ''), num: true },
  { field: 'balance', label: 'יתרה', value: t => money(t.balance), num: true },
  { field: 'note', label: 'הערה', value: t => t.note },
]

/** The column of the file a preview column reads (bank debit/credit fall back to the signed amount). */
function sourceColumn(mapping: ImportMapping, field: MappingField): number | undefined {
  if ((field === 'debit' || field === 'credit') && mapping.amountMode === 'signed') return mapping.columns.amount
  return mapping.columns[field]
}

/**
 * The file as it will be imported: the first rows the mapping reads, with the
 * cells it could not read marked. Rows the mapping skips are only counted.
 */
export function MappedPreview({
  kind,
  sheet,
  mapping,
  check,
  totalRows,
  otherSheets = [],
  emptyNote,
}: {
  kind: MappingKind
  sheet: RawSheet | undefined
  mapping: ImportMapping
  check: MappingCheck
  /** rows in the whole file, when the preview has only the first ones */
  totalRows?: number
  /** Names of the file's other sheets with the same header: the import reads them too (ENG-69) */
  otherSheets?: string[]
  /** Shown instead of the reason when there are no rows to show */
  emptyNote?: string
}) {
  const { result, reason } = check
  const shown = result.outcomes.filter(o => o.status !== 'skipped').slice(0, PREVIEW_ROWS)
  const errorRows = new Set(result.errors.filter(e => e.row >= 0).map(e => e.row)).size
  const cols = (kind === 'card' ? CARD_COLS : BANK_COLS) as Col<ParsedCCTransaction | ParsedBankTransaction>[]
  // only the columns the mapping fills (the card billing date always shows)
  const visible = cols.filter(c => (kind === 'card' && c.field === 'billingDate') || sourceColumn(mapping, c.field) !== undefined)
  const partial = totalRows !== undefined && sheet !== undefined && totalRows > sheet.rows.length

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">תצוגה מקדימה של הייבוא</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {result.rows.length === 1 ? 'עסקה אחת' : `${nfInt.format(result.rows.length)} עסקאות`}
          {result.skipped > 0 && <> · {result.skipped === 1 ? 'שורה אחת דולגה' : `${nfInt.format(result.skipped)} שורות דולגו`}</>}
          {result.pending > 0 && <> · {result.pending === 1 ? 'עסקה אחת שטרם נקלטה תדלג' : `${nfInt.format(result.pending)} עסקאות שטרם נקלטו ידלגו`}</>}
          {errorRows > 0 && <span className="text-destructive"> · {errorRows === 1 ? 'שורה אחת עם שגיאה' : `${nfInt.format(errorRows)} שורות עם שגיאות`}</span>}
          {partial && <> · לפי {nfInt.format(sheet!.rows.length)} השורות הראשונות</>}
        </p>
      </div>

      {otherSheets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          ייקראו גם {otherSheets.length === 1 ? 'הגיליון' : 'הגיליונות'}{' '}
          {otherSheets.map((n, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <bdi className="font-medium text-foreground">{n}</bdi>
            </span>
          ))}
          , עם אותה שורת כותרת. גיליונות עם כותרת אחרת לא נקראים.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyNote ?? reason ?? 'אין שורות להצגה'}
        </p>
      ) : (
        <div className="max-h-[50vh] max-w-full overflow-auto overscroll-contain rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 z-10 border-b bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  <span className="sr-only">שורה בקובץ</span>#
                </th>
                {visible.map(c => (
                  <th
                    key={c.field}
                    scope="col"
                    className={cn(
                      'sticky top-0 z-10 whitespace-nowrap border-b bg-muted px-2 py-1.5 text-start text-xs font-medium text-muted-foreground',
                      c.num && 'text-end'
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(o => {
                const errs = o.status === 'error' ? o.errors : []
                return (
                  <tr key={o.row} className={cn(o.status === 'error' && 'bg-destructive/5')}>
                    <th scope="row" className="border-b px-2 py-1 text-center text-xs font-normal tabular-nums text-muted-foreground">
                      {o.row + 1}
                    </th>
                    {visible.map(c => {
                      const err = errs.find(e => e.field === c.field || (c.field === 'debit' && e.field === 'amount'))
                      const srcCol = sourceColumn(mapping, c.field)
                      const raw = srcCol !== undefined ? sheet?.rows[o.row]?.[srcCol] : null
                      return (
                        <td
                          key={c.field}
                          dir="auto"
                          title={err?.message}
                          className={cn(
                            'max-w-56 truncate whitespace-nowrap border-b px-2 py-1 text-start',
                            c.num && 'text-end',
                            err && 'bg-destructive/10 font-medium text-destructive'
                          )}
                        >
                          {o.status === 'ok' ? (
                            c.value(o.tx)
                          ) : err ? (
                            <span className="inline-flex items-center gap-1">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {raw === null || raw === undefined || raw === '' ? err.message : String(raw)}
                              <span className="sr-only"> ({err.message})</span>
                            </span>
                          ) : raw === null || raw === undefined ? (
                            ''
                          ) : (
                            <span className="text-muted-foreground">{String(raw)}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
