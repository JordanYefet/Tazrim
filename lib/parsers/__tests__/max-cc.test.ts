import { describe, it, expect } from 'vitest'
import { parseMaxCC } from '../max-cc'
import * as XLSX from 'xlsx'

const HEADER_ROW = [
  'תאריך עסקה','שם בית העסק','קטגוריה','4 ספרות אחרונות של כרטיס האשראי',
  'סוג עסקה','סכום חיוב','מטבע חיוב','סכום עסקה מקורי','מטבע עסקה מקורי',
  'תאריך חיוב','הערות','תיוגים','מועדון הנחות','מפתח דיסקונט',
  'אופן ביצוע ההעסקה','שער המרה ממטבע מקור/התחשבנות לש"ח',
]

function buildWorkbook(dataRows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const rows = [
    ['כל המשתמשים (1)', ''],
    ['כל הכרטיסים (1)', ''],
    ['2026-01-25-2026-04-25', ''],
    HEADER_ROW,
    ...dataRows,
    ['סך הכל'],
    ['165.50₪'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

const TX1 = ['25-01-2026','מכולת לדוגמה','מזון וצריכה','1234','רגילה',120.50,'₪',120.50,'₪','02-02-2026','','','','','','']
const TX2 = ['26-01-2026','חנות פירות לדוגמה','מזון וצריכה','1234','רגילה',45,'₪',45,'₪','02-02-2026','','','','','','']

describe('parseMaxCC', () => {
  it('skips metadata, header, and footer — returns 2 transactions', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1, TX2]))
    expect(transactions).toHaveLength(2)
  })

  it('parses transaction date DD-MM-YYYY correctly', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].transactionDate).toEqual(new Date(2026, 0, 25))
  })

  it('parses billing date correctly', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].billingDate).toEqual(new Date(2026, 1, 2))
  })

  it('parses charged amount', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].chargedAmount).toBe(120.50)
  })

  it('sets cardProvider to MAX', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].cardProvider).toBe('MAX')
  })

  it('sets merchantName equal to originalMerchantName by default', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].merchantName).toBe(transactions[0].originalMerchantName)
  })

  it('captures category from column 2', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].category).toBe('מזון וצריכה')
  })

  it('combines both sheets when workbook has two sheets', () => {
    const wb = XLSX.utils.book_new()
    const makeSheet = (rows: unknown[][]) =>
      XLSX.utils.aoa_to_sheet([
        ['כל המשתמשים (1)', ''],
        ['כל הכרטיסים (1)', ''],
        ['2026-01-25-2026-04-25', ''],
        HEADER_ROW,
        ...rows,
        ['סך הכל'],
      ])
    XLSX.utils.book_append_sheet(wb, makeSheet([TX1]), 'Sheet1')
    XLSX.utils.book_append_sheet(wb, makeSheet([TX2]), 'Sheet2')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const { transactions } = parseMaxCC(buf)
    expect(transactions).toHaveLength(2)
  })
})
