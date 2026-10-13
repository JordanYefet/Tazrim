import { readWorkbookRows } from './file-readers'
import type { ParsedCCTransaction, ParseResult } from './types'

function parseAmount(val: unknown): number {
  if (typeof val === 'number') return val
  return parseFloat(String(val ?? '0').replace(/,/g, '')) || 0
}

function parseDashedDate(val: unknown): Date {
  const str = String(val ?? '')
  const [day, month, year] = str.split('-')
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
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

function parseSheet(rows: unknown[][]): ParsedCCTransaction[] {
  // rows[0-2]: metadata, rows[3]: headers, rows[4+]: data + footer
  const colMap = buildColMap(rows[3] as string[])

  return rows.slice(4).filter(isDataRow).map(row => {
    const r = row as unknown[]
    const originalMerchantName = String(r[colMap['שם בית העסק']] ?? '').trim()
    return {
      transactionDate: parseDashedDate(r[colMap['תאריך עסקה']]),
      billingDate: parseDashedDate(r[colMap['תאריך חיוב']]),
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
    }
  })
}

export function parseMaxCC(buffer: Buffer): ParseResult<ParsedCCTransaction> {
  const transactions: ParsedCCTransaction[] = []

  for (const { rows } of readWorkbookRows(buffer)) {
    transactions.push(...parseSheet(rows))
  }

  return { transactions, errors: [] }
}
