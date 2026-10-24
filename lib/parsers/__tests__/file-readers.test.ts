import { describe, it, expect } from 'vitest'
import { sniffFormat, decodeText, readHtmlTables, toBuffer } from '../file-readers'

// All values below are made up.

describe('sniffFormat', () => {
  it('detects zip (xlsx), OLE (xls), html and text', () => {
    expect(sniffFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('xlsx')
    expect(sniffFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('xls')
    expect(sniffFormat(Buffer.from('  <html><table></table></html>'))).toBe('xls-html')
    expect(sniffFormat(Buffer.from('<TABLE><TR><TD>x</TD></TR></TABLE>'))).toBe('xls-html')
    expect(sniffFormat(Buffer.from('a,b\n1,2'))).toBe('csv')
    expect(sniffFormat(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull()
  })

  it('routes SpreadsheetML XML to the workbook reader', () => {
    const xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"></Workbook>'
    expect(sniffFormat(Buffer.from(xml))).toBe('xls')
  })
})

describe('decodeText', () => {
  it('strips a UTF-8 BOM', () => {
    expect(decodeText(Buffer.from('﻿שלום'))).toBe('שלום')
  })
  it('falls back to windows-1255 for invalid UTF-8', () => {
    expect(decodeText(Buffer.from([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום')
  })
  it('decodes UTF-16LE with a BOM', () => {
    const b = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('אב', 'utf16le')])
    expect(decodeText(b)).toBe('אב')
  })
})

describe('readHtmlTables', () => {
  it('returns each table as rows of trimmed cell text with colSpan', () => {
    const tables = readHtmlTables(
      '<table><tr><td> א </td><th colspan="2">ב</th></tr></table><table><tr><td>ג</td></tr></table>'
    )
    expect(tables).toHaveLength(2)
    expect(tables[0]).toEqual([[{ text: 'א', colSpan: 1 }, { text: 'ב', colSpan: 2 }]])
    expect(tables[1][0][0].text).toBe('ג')
  })
})

describe('toBuffer', () => {
  it('normalizes ArrayBuffer, Uint8Array and Buffer', () => {
    const u8 = new Uint8Array([1, 2, 3])
    expect(toBuffer(u8.buffer)).toEqual(Buffer.from([1, 2, 3]))
    expect(toBuffer(u8)).toEqual(Buffer.from([1, 2, 3]))
    expect(toBuffer(Buffer.from([4]))).toEqual(Buffer.from([4]))
  })
})
