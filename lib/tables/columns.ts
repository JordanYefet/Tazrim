/**
 * Optional columns of the account transaction tables (/cards/<id>, /banks/<id>): fields
 * an export may carry, shown when the user ticks them in the table's "עמודות" menu.
 * The choice is kept in a cookie per table kind, so the server renders it.
 */

export type TableKind = 'card' | 'bank'

export const CARD_COLUMNS = [
  { key: 'chargedCurrency', label: 'מטבע חיוב' },
  { key: 'originalAmount', label: 'סכום עסקה' },
  { key: 'reference', label: 'אסמכתא' },
  { key: 'cardLastFour', label: '4 ספרות' },
  { key: 'transactionType', label: 'סוג עסקה' },
  { key: 'notes', label: 'הערות' },
] as const

export const BANK_COLUMNS = [{ key: 'reference', label: 'אסמכתא' }] as const

export type CardColumn = (typeof CARD_COLUMNS)[number]['key']
export type BankColumn = (typeof BANK_COLUMNS)[number]['key']

const COLUMNS: Record<TableKind, readonly { key: string; label: string }[]> = { card: CARD_COLUMNS, bank: BANK_COLUMNS }

export function columnsFor(kind: TableKind): readonly { key: string; label: string }[] {
  return COLUMNS[kind]
}

export const columnsCookie = (kind: TableKind) => `tazrim_columns_${kind}`

/** The shown optional columns, in the table's order; unknown keys are dropped. */
export function parseColumns(value: string | undefined, kind: TableKind): string[] {
  const chosen = new Set((value ?? '').split(',').map(s => s.trim()))
  return COLUMNS[kind].map(c => c.key).filter(k => chosen.has(k))
}

export function formatColumns(keys: readonly string[]): string {
  return keys.join(',')
}
