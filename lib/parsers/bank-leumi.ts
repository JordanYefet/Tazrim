import { parse as parseHtml } from 'node-html-parser'
import type { ParsedBankTransaction, ParseResult } from './types'

function parseAmount(val: string): number {
  return parseFloat(val.replace(/,/g, '')) || 0
}

function parseDate(val: string): Date {
  const [day, month, year] = val.split('/')
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
}

export function parseBankLeumi(
  buffer: Buffer,
  fileName: string
): ParseResult<ParsedBankTransaction> {
  const root = parseHtml(buffer.toString('utf-8'))
  const tables = root.querySelectorAll('table')

  for (const table of tables) {
    const rows = table.querySelectorAll('tr')
    let headerRowIndex = -1

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td, th').map(td => td.text.trim())
      if (cells[0] === 'תאריך') { headerRowIndex = i; break }
    }

    if (headerRowIndex === -1) continue

    const transactions: ParsedBankTransaction[] = []
    const dataRows = Array.from(rows).slice(headerRowIndex + 1)

    for (const row of dataRows) {
      const cells = row.querySelectorAll('td, th').map(td => td.text.trim())
      if (!cells[0] || !cells[0].includes('/')) continue

      const desc = cells[1]?.trim() ?? ''
      transactions.push({
        date: parseDate(cells[0]),
        originalDescription: desc,
        description: desc,
        debit: parseAmount(cells[2] ?? '0'),
        credit: parseAmount(cells[3] ?? '0'),
        balance: parseAmount(cells[4] ?? '0'),
        note: cells[5]?.trim() ?? '',
        sourceFile: fileName,
      })
    }

    return { transactions, errors: [] }
  }

  return { transactions: [], errors: ['לא נמצאה טבלת עסקאות בקובץ'] }
}
