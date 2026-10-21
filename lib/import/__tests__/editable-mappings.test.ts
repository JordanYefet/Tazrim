import { describe, expect, it } from 'vitest'
import { applyMapping, headerSignature, suggestMapping, validateMapping, type ImportMapping } from '../mapping'
import {
  buildSnapshot,
  parseSnapshot,
  SAMPLE_ROWS,
  snapshotFromSignature,
  snapshotSheet,
  snapshotSignature,
  validateSnapshot,
} from '../snapshot'
import { locateHeader, mappedSheets, shiftMapping } from '../sheets'
import { BUILT_IN_LAYOUTS, builtInLayoutFor, layoutSignature, layoutSnapshot, MAX_HEADER } from '../builtin-layouts'
import { calXlsx, cardWithBillingColumnCsv, sheetOf } from './fixtures'
import { readRawGrid } from '@/lib/parsers/raw-grid'
import { maxXlsxWithPending } from '@/lib/upload/__tests__/fixtures'

// ENG-69. Every value is made up.

describe('header snapshots', () => {
  it('keeps the header row, the first clean rows and a billing-date cell above the header', () => {
    const sheet = sheetOf(calXlsx())
    const mapping = suggestMapping(sheet, 'card')
    const snap = buildSnapshot(sheet, mapping, 'card')
    expect(snapshotSignature(snap)).toBe(headerSignature(sheet, mapping.headerRow))
    expect(snap.samples).toHaveLength(3)
    expect(snap.samples[0][1]).toBe('מאפייה בדויה')
    expect(snap.cells).toEqual([{ row: 2, col: 0, value: 'עסקאות לחיוב ב-10/02/2030: 452.60 ₪' }])
  })

  it('caps the samples and laid out again maps to the same rows', () => {
    const lines = ['תאריך רכישה,בית עסק,סכום חיוב,תאריך חיוב']
    for (let i = 1; i <= 9; i++) lines.push(`0${i}/03/2030,עסק בדוי ${i},${i}.50,10/04/2030`)
    const sheet = sheetOf(Buffer.from(lines.join('\n')), 'c.csv')
    const mapping = suggestMapping(sheet, 'card')
    const snap = buildSnapshot(sheet, mapping, 'card')
    expect(snap.samples).toHaveLength(SAMPLE_ROWS)
    const laid = snapshotSheet(snap, mapping)
    const res = applyMapping(laid, mapping, 'card')
    expect(res.errors).toEqual([])
    expect(res.rows.map(r => r.originalMerchantName)).toEqual(['עסק בדוי 1', 'עסק בדוי 2', 'עסק בדוי 3', 'עסק בדוי 4', 'עסק בדוי 5'])
  })

  it('lays the header at the mapping row, with the stored cell above it', () => {
    const sheet = sheetOf(calXlsx())
    const mapping = suggestMapping(sheet, 'card')
    const laid = snapshotSheet(buildSnapshot(sheet, mapping, 'card'), mapping)
    expect(headerSignature(laid, mapping.headerRow)).toBe(headerSignature(sheet, mapping.headerRow))
    expect(laid.rows[2][0]).toContain('10/02/2030')
    expect(applyMapping(laid, mapping, 'card').rows).toHaveLength(3)
  })

  it('validates what comes from the client or the DB', () => {
    expect(validateSnapshot({ v: 1, header: ['a'], samples: [] }).ok).toBe(true)
    expect(validateSnapshot({ v: 2, header: ['a'], samples: [] }).ok).toBe(false)
    expect(validateSnapshot({ v: 1, header: [], samples: [] }).ok).toBe(false)
    expect(validateSnapshot({ v: 1, header: ['a'], samples: Array(SAMPLE_ROWS + 1).fill(['x']) }).ok).toBe(false)
    expect(validateSnapshot({ v: 1, header: ['a'], samples: [[{}]] }).ok).toBe(false)
    expect(validateSnapshot({ v: 1, header: ['a'], samples: [['x'.repeat(201)]] }).ok).toBe(false)
    expect(parseSnapshot('not json')).toBeNull()
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot(JSON.stringify({ v: 1, header: ['a', null, 3], samples: [], extra: 1 }))).toEqual({ v: 1, header: ['a', null, 3], samples: [] })
  })

  it('rebuilds a header from a pre-ENG-69 signature', () => {
    const snap = snapshotFromSignature('תאריך|תיאור||סכום')!
    expect(snap).toEqual({ v: 1, header: ['תאריך', 'תיאור', null, 'סכום'], samples: [], rebuilt: true })
    expect(snapshotSignature(snap)).toBe('תאריך|תיאור||סכום')
    expect(snapshotFromSignature('  ')).toBeNull()
  })
})

describe('locating the header and the sheets a mapping reads', () => {
  const sheet = sheetOf(cardWithBillingColumnCsv(), 'c.csv')
  const mapping = suggestMapping(sheet, 'card')
  const sig = headerSignature(sheet, 0)

  it('finds a header that moved down and shifts the data range with it', () => {
    const moved = { rows: [['כותרת בדויה'], [null], ...sheet.rows] }
    const placed = locateHeader(moved, { ...mapping, endRow: 2 }, sig)!
    expect(placed.headerRow).toBe(2)
    expect(placed.endRow).toBe(4)
    expect(locateHeader(moved, mapping, 'אין|כזו')).toBeNull()
  })

  it('shifts a billing-date cell above the header', () => {
    const m: ImportMapping = { ...mapping, headerRow: 3, billingDate: { from: 'cell', row: 2, col: 0 } }
    expect(shiftMapping(m, 2).billingDate).toEqual({ from: 'cell', row: 4, col: 0 })
  })

  it('reads every sheet with the same header, not the others', () => {
    const wb = readRawGrid(maxXlsxWithPending(), 'max-fake.xlsx')
    const layout = BUILT_IN_LAYOUTS.max.mapping
    const found = mappedSheets(wb, layout)
    expect(found.map(s => s.index)).toEqual([0, 1])
    const other = { sheets: [...wb.sheets, { name: 'אחר', rows: [['כותרת אחרת', 'x']], rowCount: 1, columnCount: 2 }] }
    expect(mappedSheets(other, layout).map(s => s.index)).toEqual([0, 1])
  })
})

describe('rows a mapping skips (ENG-69)', () => {
  const max = readRawGrid(maxXlsxWithPending(), 'max-fake.xlsx')
  const mapping = BUILT_IN_LAYOUTS.max.mapping

  it('counts card rows with no billing date as pending, not as errors', () => {
    const res = applyMapping(max.sheets[1], mapping, 'card')
    expect(res.errors).toEqual([])
    expect(res.rows).toEqual([])
    expect(res.pending).toBe(2)
    expect(applyMapping(max.sheets[0], mapping, 'card')).toMatchObject({ pending: 0, errors: [] })
  })

  it('reports them as errors when skipping is off', () => {
    expect(applyMapping(max.sheets[1], { ...mapping, skipInvalid: false }, 'card').errors.length).toBeGreaterThan(0)
  })

  it('skips a dated bank row with no amount at all', () => {
    const sheet = sheetOf(Buffer.from('תאריך,תיאור,חובה,זכות\n01/01/2030,העברה בדויה,5,\n02/01/2030,שורת מידע בדויה,,\n'), 'b.csv')
    const res = applyMapping(sheet, suggestMapping(sheet, 'bank'), 'bank')
    expect(res.errors).toEqual([])
    expect(res.rows).toHaveLength(1)
    expect(res.skipped).toBe(1)
  })
})

describe('built-in layouts', () => {
  it('are valid mappings whose header matches the parser fixtures', () => {
    for (const layout of Object.values(BUILT_IN_LAYOUTS)) {
      expect(validateMapping(layout.mapping, layout.kind)).toMatchObject({ ok: true })
      expect(snapshotSignature(layoutSnapshot(layout))).toBe(layoutSignature(layout))
      expect(layout.warning.length).toBeGreaterThan(0)
    }
    const wb = readRawGrid(maxXlsxWithPending(), 'max-fake.xlsx')
    // the upload fixture has the first 11 of Max's columns
    expect(headerSignature(wb.sheets[0], 3)).toBe(headerSignature({ rows: [MAX_HEADER.slice(0, 11)] }, 0))
  })

  it('only apply to the provider and kind they were made for', () => {
    expect(builtInLayoutFor({ kind: 'CREDIT_CARD', provider: 'max' })?.provider).toBe('max')
    expect(builtInLayoutFor({ kind: 'BANK', provider: 'leumi' })?.provider).toBe('leumi')
    expect(builtInLayoutFor({ kind: 'BANK', provider: 'max' })).toBeNull()
    expect(builtInLayoutFor({ kind: 'CREDIT_CARD', provider: 'cal' })).toBeNull()
  })
})
