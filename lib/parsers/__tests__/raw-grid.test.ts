import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readRawGrid, truncateWorkbook, RawGridError } from '../raw-grid'

// All values below are made up.

function xlsxBuffer(sheets: Record<string, unknown[][]>, bookType: XLSX.BookType = 'xlsx'): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType }))
}

const MAX_STYLE = [
  ['כל המשתמשים (1)'],
  ['כל הכרטיסים (1)'],
  ['2026-01-01-2026-01-31'],
  ['תאריך עסקה', 'שם בית העסק', 'קטגוריה', 'סכום חיוב'],
  ['05-01-2026', 'מאפייה לדוגמה', 'מזון וצריכה', 42.5],
  ['07-01-2026', 'חנות ספרים בדויה', 'פנאי', 99],
  ['סך הכל'],
]

const LEUMI_STYLE_HTML = `<HTML dir="RTL"><head><meta charset="utf-8"></head><body>
<table><tr><td>היתרה 1,000.00</td><td>מסגרת 0.00</td></tr></table>
<table>
  <tr><td colspan="3">תנועות בחשבון</td></tr>
  <tr><th>תאריך</th><th>תיאור</th><th>בחובה</th><th>בזכות</th></tr>
  <tr><td>03/01/2026</td><td>העברה &amp; תשלום</td><td>10.00</td><td>0.00</td></tr>
  <tr><td>04/01/2026</td><td> הפקדה </td><td>0.00</td><td>20.00</td></tr>
</table>
</body></HTML>`

describe('readRawGrid — xlsx', () => {
  it('reads a MAX-style workbook with metadata rows as a padded grid', () => {
    const wb = readRawGrid(xlsxBuffer({ Sheet1: MAX_STYLE }), 'card.xlsx')
    expect(wb.format).toBe('xlsx')
    expect(wb.sheets).toHaveLength(1)
    const s = wb.sheets[0]
    expect(s.name).toBe('Sheet1')
    expect(s.rowCount).toBe(7)
    expect(s.columnCount).toBe(4)
    expect(s.rows.every(r => r.length === 4)).toBe(true)
    expect(s.rows[0]).toEqual(['כל המשתמשים (1)', null, null, null])
    expect(s.rows[3][1]).toBe('שם בית העסק')
    expect(s.rows[4]).toEqual(['05-01-2026', 'מאפייה לדוגמה', 'מזון וצריכה', 42.5])
  })

  it('returns every sheet in order', () => {
    const wb = readRawGrid(
      xlsxBuffer({ 'ראשון': [['א', 1]], 'שני': [['ב', 2], ['ג', 3]] }),
      'two.xlsx'
    )
    expect(wb.sheets.map(s => s.name)).toEqual(['ראשון', 'שני'])
    expect(wb.sheets[1].rowCount).toBe(2)
  })

  it('does not throw on an empty sheet', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'ריק')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'מלא')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const out = readRawGrid(buf, 'empty.xlsx')
    expect(out.sheets[0]).toEqual({ name: 'ריק', rows: [], rowCount: 0, columnCount: 0 })
    expect(out.sheets[1].rows).toEqual([['x']])
  })

  it('renders real date cells as ISO yyyy-mm-dd strings', () => {
    const ws = XLSX.utils.aoa_to_sheet([['תאריך'], [new Date(Date.UTC(2026, 2, 15))]], { cellDates: false })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const out = readRawGrid(buf, 'dates.xlsx')
    expect(out.sheets[0].rows[1][0]).toBe('2026-03-15')
  })

  it('keeps the time when a date cell has one', () => {
    // 46096.5 = 2026-03-15 12:00 in the 1900 date system
    const ws = XLSX.utils.aoa_to_sheet([[{ t: 'n', v: 46096.5, z: 'yyyy-mm-dd hh:mm' }]])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    expect(readRawGrid(buf, 't.xlsx').sheets[0].rows[0][0]).toBe('2026-03-15 12:00')
  })

  it('trims trailing empty rows and columns but keeps interior blanks', () => {
    const ws = XLSX.utils.aoa_to_sheet([['a', null, 'c'], [null], ['d']])
    ws['!ref'] = 'A1:F10'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const s = readRawGrid(buf, 'x.xlsx').sheets[0]
    expect(s.rows).toEqual([['a', null, 'c'], [null, null, null], ['d', null, null]])
  })

  it('accepts ArrayBuffer and Uint8Array input', () => {
    const buf = xlsxBuffer({ S: [['a']] })
    const u8 = new Uint8Array(buf)
    expect(readRawGrid(u8, 'a.xlsx').sheets[0].rows).toEqual([['a']])
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
    expect(readRawGrid(ab, 'a.xlsx').sheets[0].rows).toEqual([['a']])
  })
})

describe('readRawGrid — binary xls', () => {
  it('reads a BIFF8 .xls workbook', () => {
    const wb = readRawGrid(xlsxBuffer({ Sheet1: MAX_STYLE }, 'biff8'), 'card.xls')
    expect(wb.format).toBe('xls')
    expect(wb.sheets[0].rows[4][1]).toBe('מאפייה לדוגמה')
  })
})

describe('readRawGrid — HTML disguised as xls (Leumi style)', () => {
  it('detects HTML by content even with an .xls name and stacks all tables', () => {
    const wb = readRawGrid(Buffer.from(LEUMI_STYLE_HTML), 'bank.xls')
    expect(wb.format).toBe('xls-html')
    expect(wb.sheets).toHaveLength(1)
    const s = wb.sheets[0]
    expect(s.columnCount).toBe(4)
    expect(s.rows).toEqual([
      ['היתרה 1,000.00', 'מסגרת 0.00', null, null],
      ['תנועות בחשבון', null, null, null],
      ['תאריך', 'תיאור', 'בחובה', 'בזכות'],
      ['03/01/2026', 'העברה & תשלום', '10.00', '0.00'],
      ['04/01/2026', 'הפקדה', '0.00', '20.00'],
    ])
  })

  it('expands colspan so later cells stay aligned', () => {
    const html = '<table><tr><td colspan="2">א</td><td>ב</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>'
    const s = readRawGrid(Buffer.from(html), 'x.xls').sheets[0]
    expect(s.rows).toEqual([['א', null, 'ב'], ['1', '2', '3']])
  })

  it('handles a UTF-8 BOM and leading whitespace', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('\n  ' + LEUMI_STYLE_HTML)])
    expect(readRawGrid(buf, 'bank.xls').format).toBe('xls-html')
  })

  it('decodes a windows-1255 HTML file', () => {
    const html = '<html><head><meta charset="windows-1255"></head><body><table><tr><td>שלום</td></tr></table></body></html>'
    const buf = encode1255(html)
    expect(readRawGrid(buf, 'bank.xls').sheets[0].rows).toEqual([['שלום']])
  })

  it('returns an empty sheet for HTML without tables', () => {
    const s = readRawGrid(Buffer.from('<html><body><p>אין נתונים</p></body></html>'), 'x.xls').sheets[0]
    expect(s).toMatchObject({ rows: [], rowCount: 0, columnCount: 0 })
  })
})

describe('readRawGrid — csv (unknown provider)', () => {
  it('parses comma CSV with a BOM, quotes and embedded newlines', () => {
    const csv = '﻿תאריך,פירוט,סכום\r\n2026-02-01,"ספק, בדוי",12.30\r\n2026-02-02,"שורה\nשנייה","say ""hi"""\r\n'
    const wb = readRawGrid(Buffer.from(csv), 'other.csv')
    expect(wb.format).toBe('csv')
    expect(wb.sheets[0].rows).toEqual([
      ['תאריך', 'פירוט', 'סכום'],
      ['2026-02-01', 'ספק, בדוי', '12.30'],
      ['2026-02-02', 'שורה\nשנייה', 'say "hi"'],
    ])
  })

  it('detects semicolon delimiter', () => {
    const csv = 'תאריך;סכום;הערה\n01.02.2026;1,50;א\n02.02.2026;2,75;ב\n'
    const s = readRawGrid(Buffer.from(csv), 'x.csv').sheets[0]
    expect(s.rows[1]).toEqual(['01.02.2026', '1,50', 'א'])
    expect(s.columnCount).toBe(3)
  })

  it('detects tab delimiter', () => {
    const csv = 'a\tb\tc\n1\t2\t3\n'
    expect(readRawGrid(Buffer.from(csv), 'x.tsv').sheets[0].rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('pads ragged rows', () => {
    const s = readRawGrid(Buffer.from('a,b,c\n1\n'), 'x.csv').sheets[0]
    expect(s.rows).toEqual([['a', 'b', 'c'], ['1', null, null]])
  })

  it('decodes windows-1255 Hebrew CSV', () => {
    const buf = encode1255('תאריך,סכום\n01/02/2026,5\n')
    expect(readRawGrid(buf, 'x.csv').sheets[0].rows[0]).toEqual(['תאריך', 'סכום'])
  })

  it('names the single CSV sheet after the file', () => {
    expect(readRawGrid(Buffer.from('a\n'), 'דוח-בדוי.csv').sheets[0].name).toBe('דוח-בדוי')
  })
})

describe('readRawGrid — errors', () => {
  it('throws EMPTY_FILE for a zero-byte file', () => {
    expect(() => readRawGrid(Buffer.alloc(0), 'x.csv')).toThrowError(RawGridError)
    try { readRawGrid(Buffer.alloc(0), 'x.csv') } catch (e) {
      expect((e as RawGridError).code).toBe('EMPTY_FILE')
    }
  })

  it('throws UNSUPPORTED_FORMAT for binary junk', () => {
    const junk = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02, 0xff, 0x00, 0x10])
    try {
      readRawGrid(junk, 'x.pdf')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(RawGridError)
      expect((e as RawGridError).code).toBe('UNSUPPORTED_FORMAT')
    }
  })

  it('throws CORRUPT_FILE for a broken zip that looks like xlsx', () => {
    const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 7)])
    try {
      readRawGrid(broken, 'x.xlsx')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(RawGridError)
      expect((e as RawGridError).code).toBe('CORRUPT_FILE')
    }
  })
})

describe('truncateWorkbook', () => {
  it('keeps the first N rows per sheet and reports the rest', () => {
    const rows = Array.from({ length: 5 }, (_, i) => [`r${i}`])
    const wb = readRawGrid(Buffer.from(rows.map(r => r[0]).join('\n')), 'x.csv')
    const t = truncateWorkbook(wb, 2)
    expect(t.sheets[0].rows).toEqual([['r0'], ['r1']])
    expect(t.sheets[0].rowCount).toBe(5)
    expect(t.sheets[0].omittedRowCount).toBe(3)
  })

  it('reports zero omitted rows when under the cap', () => {
    const wb = readRawGrid(Buffer.from('a\nb'), 'x.csv')
    expect(truncateWorkbook(wb, 200).sheets[0].omittedRowCount).toBe(0)
  })
})

function encode1255(s: string): Buffer {
  // Minimal encoder: ASCII as-is, Hebrew letters U+05D0..U+05EA -> 0xE0..0xFA
  const bytes: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) bytes.push(c)
    else if (c >= 0x05d0 && c <= 0x05ea) bytes.push(0xe0 + (c - 0x05d0))
    else throw new Error('unencodable ' + ch)
  }
  return Buffer.from(bytes)
}
