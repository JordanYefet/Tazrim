/**
 * Upload-page helpers around a column mapping: editing it one column at a
 * time, and checking whether a file can be imported with it (and why not).
 * Pure, so the mapper UI stays a thin shell.
 */
import {
  applyMapping,
  FIELD_LABELS,
  fieldsFor,
  missingFields,
  type ImportMapping,
  type MappingField,
  type MappingKind,
  type MappingResult,
  type ParsedFor,
} from '@/lib/import/mapping'
import type { RawSheet } from '@/lib/parsers/raw-grid'

/** The field a column is mapped to, if any. */
export function fieldOfColumn(mapping: ImportMapping, col: number): MappingField | undefined {
  return (Object.entries(mapping.columns) as [MappingField, number][]).find(([, c]) => c === col)?.[0]
}

/**
 * Maps `col` to `field` (null = ignore). A field moves away from the column it
 * was on. Bank: picking "amount" switches to one signed column, picking
 * debit/credit back to two.
 */
export function setColumnField(mapping: ImportMapping, kind: MappingKind, col: number, field: MappingField | null): ImportMapping {
  const columns: Partial<Record<MappingField, number>> = {}
  for (const [f, c] of Object.entries(mapping.columns) as [MappingField, number][]) {
    if (c !== col && f !== field) columns[f] = c
  }
  if (field) columns[field] = col
  const next: ImportMapping = { ...mapping, columns }
  if (kind === 'bank' && field) {
    if (field === 'amount' && mapping.amountMode !== 'signed') {
      next.amountMode = 'signed'
      next.expensesNegative = true
      delete columns.debit
      delete columns.credit
    } else if ((field === 'debit' || field === 'credit') && mapping.amountMode === 'signed') {
      next.amountMode = 'split'
      delete columns.amount
    }
  }
  if (kind === 'card' && field === 'billingDate') next.billingDate = { from: 'column' }
  return next
}

/** Fields offered in a column's select, in order. */
export function selectableFields(kind: MappingKind): readonly MappingField[] {
  return fieldsFor(kind)
}

export type MappingCheck<K extends MappingKind = MappingKind> = {
  /** Every row the file preview has, mapped */
  result: MappingResult<ParsedFor<K>>
  /** Why the import is disabled, or null when it can go */
  reason: string | null
}

const list = (fields: MappingField[]) => fields.map(f => FIELD_LABELS[f]).join(', ')

/** Whether `sheet` imports cleanly with `mapping`, and the parsed rows for the preview. */
export function checkMapping<K extends MappingKind>(sheet: RawSheet | undefined, mapping: ImportMapping, kind: K): MappingCheck<K> {
  const empty: MappingResult<ParsedFor<K>> = { rows: [], rowNumbers: [], errors: [], skipped: 0, pending: 0, outcomes: [] }
  if (!sheet) return { result: empty, reason: 'הגיליון שנבחר לא נמצא בקובץ' }
  const missing = missingFields(mapping, kind)
  if (missing.length) {
    const billingOnly = kind === 'card' && missing.includes('billingDate')
    const rest = missing.filter(f => f !== 'billingDate')
    const parts = [
      rest.length ? `חסרות עמודות: ${list(rest)}` : '',
      billingOnly ? 'בחר עמודה לתאריך החיוב או מקור אחר' : '',
    ].filter(Boolean)
    return { result: empty, reason: parts.join(' · ') }
  }
  const result = applyMapping(sheet, mapping, kind)
  const global = result.errors.find(e => e.row < 0 || !result.outcomes.some(o => o.row === e.row))
  if (global) return { result, reason: `${FIELD_LABELS[global.field]}: ${global.message}` }
  if (result.errors.length) {
    const rows = new Set(result.errors.map(e => e.row)).size
    return { result, reason: rows === 1 ? 'בשורה אחת יש שגיאה' : `ב־${rows} שורות יש שגיאות` }
  }
  if (!result.rows.length) return { result, reason: 'לא נמצאו עסקאות מתחת לשורת הכותרת' }
  return { result, reason: null }
}

/** "כאל – פירוט עסקאות" */
export function defaultProfileName(providerName: string, kind: MappingKind): string {
  return `${providerName} – ${kind === 'card' ? 'פירוט עסקאות' : 'תנועות בחשבון'}`
}
