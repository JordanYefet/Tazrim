import { readWorkbookRows } from './file-readers'
import type { ParsedCCTransaction, ParseResult } from './types'

function parseAmount(val: unknown): number {
  if (typeof val === 'number') return val
  return parseFloat(String(val ?? '0').replace(/,/g, '')) || 0
}

/** DD-MM-YYYY, or null when the cell is empty or not a date */
function parseDashedDate(val: unknown): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(val ?? '').trim())
  if (!m) return null
  const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(date.getTime()) ? null : date
}

function isDataRow(row: unknown[]): boolean {
  const first = String(row?.[0] ?? '')
  // Data rows start with DD-MM-YYYY
  return /^\d{2}-\d{2}-\d{4}$/.test(first)
}

function buildColMap(headerRow: string[]): Record<string, number> {
  return (headerRow ?? []).reduce((map, header, i) => {
    map[String(header).trim()] = i
    return map
  }, {} as Record<string, number>)
}

function parseSheet(rows: unknown[][]): { transactions: ParsedCCTransaction[]; pending: number } {
  // rows[0-2]: metadata, rows[3]: headers, rows[4+]: data + footer
  const colMap = buildColMap(rows[3] as string[])
  const transactions: ParsedCCTransaction[] = []
  let pending = 0

  for (const row of rows.slice(4).filter(isDataRow)) {
    const r = row as unknown[]
    const transactionDate = parseDashedDate(r[colMap['תאריך עסקה']])
    const billingCell = String(r[colMap['תאריך חיוב']] ?? '').trim()
    const billingDate = parseDashedDate(billingCell)
    // Approved but not billed yet (Max's "עסקאות שאושרו וטרם נקלטו" sheet): nothing
    // is charged, and the row comes back billed in a later export. Importing it now
    // would count it twice, since the billed row has a different date and amount.
    if (!billingCell) {
      pending++
      continue
    }
    // An unreadable date skips the row rather than failing the whole file
    if (!transactionDate || !billingDate) continue
    const originalMerchantName = String(r[colMap['שם בית העסק']] ?? '').trim()
    transactions.push({
      transactionDate,
      billingDate,
      originalMerchantName,
      merchantName: originalMerchantName,
      category: String(r[colMap['קטגוריה']] ?? ''),
      chargedAmount: parseAmount(r[colMap['סכום חיוב']]),
      originalAmount: parseAmount(r[colMap['סכום עסקה מקורי']]),
      originalCurrency: String(r[colMap['מטבע עסקה מקורי']] ?? '₪'),
      cardLastFour: String(r[colMap['4 ספרות אחרונות של כרטיס האשראי']] ?? ''),
      transactionType: String(r[colMap['סוג עסקה']] ?? ''),
      notes: String(r[colMap['הערות']] ?? ''),
      cardProvider: 'MAX' as const,
    })
  }
  return { transactions, pending }
}

export function parseMaxCC(buffer: Buffer): ParseResult<ParsedCCTransaction> {
  const transactions: ParsedCCTransaction[] = []
  let pending = 0

  for (const { rows } of readWorkbookRows(buffer)) {
    const sheet = parseSheet(rows)
    transactions.push(...sheet.transactions)
    pending += sheet.pending
  }

  return { transactions, errors: [], pending }
}
