/**
 * Low-level file readers shared by the provider parsers (bank-leumi, max-cc)
 * and the generic raw-grid reader. Nothing here knows about any provider's
 * column layout — it only turns bytes into text, tables or worksheet rows.
 */
import * as XLSX from 'xlsx'
import { parse as parseHtml } from 'node-html-parser'

export type BinaryInput = ArrayBuffer | Buffer | Uint8Array

export type SniffedFormat = 'xlsx' | 'xls' | 'xls-html' | 'csv'

export function toBuffer(input: BinaryInput): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  return Buffer.from(new Uint8Array(input))
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function startsWith(buf: Buffer, bytes: number[]): boolean {
  return buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b)
}

function hasUtf16Bom(buf: Buffer): boolean {
  return startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])
}

/**
 * Detect a file's real format from its bytes (never from its extension):
 * banks like Leumi ship HTML pages named `.xls`.
 * Returns null for binary content that is none of the supported formats.
 */
export function sniffFormat(buf: Buffer): SniffedFormat | null {
  if (buf.length === 0) return null
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'xlsx'
  if (startsWith(buf, OLE_MAGIC)) return 'xls'

  const head = buf.subarray(0, 4096)
  let text: string
  if (hasUtf16Bom(head)) {
    text = decodeText(head)
  } else {
    // Binary files contain NULs or many control bytes; text exports don't.
    let control = 0
    for (const b of head) {
      if (b === 0) return null
      if (b < 0x09 || (b > 0x0d && b < 0x20)) control++
    }
    if (control > head.length * 0.05) return null
    text = head.toString('latin1')
  }

  const trimmed = text.replace(/^(﻿|ï»¿)/, '').trimStart()
  if (/^<\?xml/i.test(trimmed) && /urn:schemas-microsoft-com:office:spreadsheet/i.test(text)) return 'xls'
  if (trimmed.startsWith('<') && /<(html|table|tr|td)\b/i.test(text)) return 'xls-html'
  return 'csv'
}

/**
 * Decode a text export: honours UTF-8 / UTF-16 BOMs, uses UTF-8 when the bytes
 * are valid UTF-8, and otherwise falls back to windows-1255 (legacy Hebrew).
 */
export function decodeText(buf: Buffer): string {
  if (startsWith(buf, [0xef, 0xbb, 0xbf])) return new TextDecoder('utf-8').decode(buf.subarray(3))
  if (startsWith(buf, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (startsWith(buf, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1255').decode(buf)
  }
}

export interface HtmlCell {
  text: string
  colSpan: number
}

/**
 * Every `<table>` in the document, in document order, as rows of trimmed cell
 * text. Each table only lists its own rows/cells (rows of a nested table belong
 * to the nested table).
 */
export function readHtmlTables(html: string): HtmlCell[][][] {
  const root = parseHtml(html)
  return root.querySelectorAll('table').map(table =>
    table
      .querySelectorAll('tr')
      .filter(tr => tr.closest('table') === table)
      .map(tr =>
        tr
          .querySelectorAll('td, th')
          .filter(cell => cell.closest('tr') === tr)
          .map(cell => ({
            text: cell.text.trim(),
            colSpan: Math.max(1, parseInt(cell.getAttribute('colspan') ?? '1', 10) || 1),
          }))
      )
  )
}

/** Parse an .xlsx / .xls (BIFF) / SpreadsheetML workbook. */
export function readWorkbook(buf: Buffer, opts: XLSX.ParsingOptions = {}): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'buffer', ...opts })
}

/** Every sheet of a workbook as `sheet_to_json({ header: 1 })` rows. */
export function readWorkbookRows(buf: Buffer): { name: string; rows: unknown[][] }[] {
  const workbook = readWorkbook(buf)
  return workbook.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1 }),
  }))
}
