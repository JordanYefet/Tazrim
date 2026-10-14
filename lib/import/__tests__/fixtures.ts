// Made-up files for the column mapper. Every merchant, amount and title is invented,
// and dates are in 2030 so nothing can overlap real data.
import * as XLSX from 'xlsx'
import { readRawGrid, type RawSheet } from '@/lib/parsers/raw-grid'

function xlsx(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

export function sheetOf(buf: Buffer, name = 'fake.xlsx'): RawSheet {
  return readRawGrid(buf, name).sheets[0]
}

/** Header cells break lines like the real export: "תאריך\r\nעסקה". */
export const CAL_HEADER = ['תאריך\r\nעסקה', 'שם בית עסק', 'סכום\r\nעסקה', 'סכום\r\nחיוב', 'סוג\r\nעסקה', 'ענף', 'הערות']

/**
 * Cal-shaped card export: title, blank, "עסקאות לחיוב ב-DD/MM/YYYY: <total> ₪",
 * header, data rows with real date cells, blank, free-text footer. No billing-date column.
 */
export function calXlsx(
  data: unknown[][] = [
    [new Date(2030, 0, 3), 'מאפייה בדויה', 43.91, 43.91, 'רגילה', 'מזון', null],
    [new Date(2030, 0, 5), 'ספק סטרימינג בדוי', 17.63, 17.63, 'הוראת קבע', null, null],
    [new Date(2029, 10, 20), 'חנות רהיטים בדויה', 1173.18, 391.06, 'תשלומים', 'ריהוט', 'תשלום 3 מתוך 3'],
  ]
): Buffer {
  return xlsx([
    ['פירוט עסקאות לחשבון בדוי'],
    [],
    ['עסקאות לחיוב ב-10/02/2030: 452.60 ₪'],
    CAL_HEADER,
    ...data,
    [],
    ['הנתונים בקובץ זה בדויים ומשמשים לבדיקות בלבד'],
  ])
}

/** A card export that has a billing-date column, text dates and comma thousands. */
export function cardWithBillingColumnCsv(): Buffer {
  return Buffer.from(
    [
      'תאריך רכישה,בית עסק,סכום חיוב,תאריך חיוב,קטגוריה',
      '02/03/2030,בית קפה מומצא,"1,286.71",10/04/2030,מסעדות',
      '04.03.30,דלק בדוי,₪ 83.29,10/04/2030,רכב',
      'סה"כ,,"1,370.07",,',
    ].join('\n')
  )
}

/** A bank export with one signed amount column (negative = money out). */
export function bankSignedCsv(): Buffer {
  return Buffer.from(
    [
      'דוח תנועות בדוי',
      'תאריך,תיאור,סכום,יתרה',
      '2030-01-02,משכורת בדויה,"5,317.43","5,421.15"',
      '2030-01-03,סופר בדוי,-127.83,"5,293.32"',
      '',
      'סוף הדוח',
    ].join('\n')
  )
}
