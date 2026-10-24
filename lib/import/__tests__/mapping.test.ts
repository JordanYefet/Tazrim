import { describe, expect, it } from 'vitest'
import {
  applyMapping,
  headerSignature,
  missingFields,
  normalizeHeader,
  parseAmount,
  parseDate,
  suggestMapping,
  validateMapping,
  withLaterFields,
  type ImportMapping,
} from '../mapping'
import { bankSignedCsv, calXlsx, cardWithBillingColumnCsv, sheetOf } from './fixtures'
import { leumiHtml, maxXlsx } from '@/lib/upload/__tests__/fixtures'

// All values are made up.

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('normalizeHeader / headerSignature', () => {
  it('collapses line breaks and spaces', () => {
    expect(normalizeHeader('סכום\r\nחיוב')).toBe('סכום חיוב')
    expect(normalizeHeader('  תאריך \n עסקה ')).toBe('תאריך עסקה')
    expect(normalizeHeader(null)).toBe('')
  })

  it('is the normalized header cells, and ignores data rows', () => {
    const sheet = sheetOf(calXlsx())
    expect(headerSignature(sheet, 3)).toBe('תאריך עסקה|שם בית עסק|סכום עסקה|סכום חיוב|סוג עסקה|ענף|הערות')
    const other = sheetOf(calXlsx([[day(2030, 2, 1), 'אחר בדוי', 1, 1, 'רגילה', null, null]]))
    expect(headerSignature(other, 3)).toBe(headerSignature(sheet, 3))
  })
})

describe('parseDate', () => {
  it('reads the supported formats as local midnight', () => {
    expect(parseDate('10/01/2030', 'auto')).toEqual(day(2030, 1, 10))
    expect(parseDate('10-01-2030', 'auto')).toEqual(day(2030, 1, 10))
    expect(parseDate('10.01.30', 'auto')).toEqual(day(2030, 1, 10))
    expect(parseDate('2030-01-10', 'auto')).toEqual(day(2030, 1, 10))
    expect(parseDate('2030-01-10 14:30', 'auto')).toEqual(day(2030, 1, 10))
    expect(parseDate(47493, 'auto')).toEqual(day(2030, 1, 10)) // Excel serial
    expect(parseDate('01/10/2030', 'MM/DD/YYYY')).toEqual(day(2030, 1, 10))
  })

  it('rejects what is not a date', () => {
    expect(parseDate('סה"כ', 'auto')).toBeNull()
    expect(parseDate('32/01/2030', 'auto')).toBeNull()
    expect(parseDate('31/02/2030', 'auto')).toBeNull()
    expect(parseDate(null, 'auto')).toBeNull()
    expect(parseDate(12.75, 'auto')).toBeNull()
    // a strict format keeps its separator
    expect(parseDate('10-01-2030', 'DD/MM/YYYY')).toBeNull()
    expect(parseDate(47493, 'DD/MM/YYYY')).toBeNull()
  })
})

describe('parseAmount', () => {
  const dot = { decimal: '.', thousands: ',' } as const
  it('strips currency and thousands separators', () => {
    expect(parseAmount('1,286.71', dot)).toBe(1286.71)
    expect(parseAmount('₪ 83.29', dot)).toBe(83.29)
    expect(parseAmount('83.29 ש"ח', dot)).toBe(83.29)
    expect(parseAmount('-12.47', dot)).toBe(-12.47)
    expect(parseAmount('12.47-', dot)).toBe(-12.47)
    expect(parseAmount('(12.47)', dot)).toBe(-12.47)
    expect(parseAmount(7, dot)).toBe(7)
  })

  it('honours a comma decimal separator', () => {
    expect(parseAmount('1.234,56', { decimal: ',', thousands: '.' })).toBe(1234.56)
    expect(parseAmount('1 234,56', { decimal: ',', thousands: ' ' })).toBe(1234.56)
  })

  it('returns null for empty or non-numeric text', () => {
    expect(parseAmount(null, dot)).toBeNull()
    expect(parseAmount('', dot)).toBeNull()
    expect(parseAmount('abc', dot)).toBeNull()
    expect(parseAmount('1.2.3', dot)).toBeNull()
  })
})

describe('a Cal-shaped card export (billing date in the metadata line)', () => {
  const sheet = sheetOf(calXlsx())

  it('suggests every column, and the billing date from the line above the header', () => {
    const m = suggestMapping(sheet, 'card')
    expect(m.headerRow).toBe(3)
    expect(m.columns).toEqual({
      transactionDate: 0,
      merchant: 1,
      originalAmount: 2,
      chargedAmount: 3,
      transactionType: 4,
      category: 5,
      notes: 6,
    })
    expect(m.billingDate).toEqual({ from: 'cell', row: 2, col: 0 })
    expect(missingFields(m, 'card')).toEqual([])
  })

  it('parses the data rows and skips the blank and footer rows', () => {
    const { rows, errors, rowNumbers, skipped } = applyMapping(sheet, suggestMapping(sheet, 'card'), 'card')
    expect(errors).toEqual([])
    expect(rowNumbers).toEqual([4, 5, 6])
    expect(skipped).toBe(2)
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.billingDate.getTime() === day(2030, 2, 10).getTime())).toBe(true)
    expect(rows[0]).toMatchObject({
      transactionDate: day(2030, 1, 3),
      originalMerchantName: 'מאפייה בדויה',
      merchantName: 'מאפייה בדויה',
      chargedAmount: 43.91,
      originalAmount: 43.91,
      originalCurrency: '₪',
      category: 'מזון',
      transactionType: 'רגילה',
      notes: '',
    })
    expect(rows[1].category).toBe('')
    expect(rows[2]).toMatchObject({ chargedAmount: 391.06, originalAmount: 1173.18, notes: 'תשלום 3 מתוך 3' })
  })

  it('reports a billing-date cell without a date', () => {
    const m: ImportMapping = { ...suggestMapping(sheet, 'card'), billingDate: { from: 'cell', row: 0, col: 0 } }
    const { rows, errors } = applyMapping(sheet, m, 'card')
    expect(rows).toEqual([])
    expect(errors[0]).toMatchObject({ row: 0, field: 'billingDate' })
  })

  it('a billing day gives each row its own billing date, instalments included', () => {
    // billed on the 10th for the cycle that closed at the end of the previous month: the same
    // 10/02/2030 the file states, for the January purchases and payment 3 of a November one
    const m: ImportMapping = { ...suggestMapping(sheet, 'card'), billingDate: { from: 'day', day: 10, closesOn: 31 } }
    const { rows, errors } = applyMapping(sheet, m, 'card')
    expect(errors).toEqual([])
    expect(rows.map(r => r.billingDate)).toEqual([day(2030, 2, 10), day(2030, 2, 10), day(2030, 2, 10)])
    // closing on the billing day itself: purchases before the 10th are billed that month
    const sameDay: ImportMapping = { ...m, billingDate: { from: 'day', day: 10 } }
    expect(applyMapping(sheet, sameDay, 'card').rows[0].billingDate).toEqual(day(2030, 1, 10))
  })

  it('flips the sign when expenses are negative in the file', () => {
    const neg = sheetOf(calXlsx([[day(2030, 1, 3), 'מאפייה בדויה', -43.91, -43.91, 'רגילה', null, null]]))
    const m = suggestMapping(neg, 'card')
    expect(m.expensesNegative).toBe(true)
    expect(applyMapping(neg, m, 'card').rows[0].chargedAmount).toBe(43.91)
  })
})

describe('a card export with a billing-date column (CSV, text dates)', () => {
  const sheet = sheetOf(cardWithBillingColumnCsv(), 'fake.csv')

  it('maps the billing-date column', () => {
    const m = suggestMapping(sheet, 'card')
    expect(m.headerRow).toBe(0)
    expect(m.columns).toMatchObject({ transactionDate: 0, merchant: 1, chargedAmount: 2, billingDate: 3, category: 4 })
    expect(m.billingDate).toEqual({ from: 'column' })
  })

  it('parses separators, currency symbols and two-digit years; the total row is skipped', () => {
    const { rows, errors, skipped } = applyMapping(sheet, suggestMapping(sheet, 'card'), 'card')
    expect(errors).toEqual([])
    expect(skipped).toBe(1)
    expect(rows.map(r => [r.transactionDate, r.billingDate, r.chargedAmount, r.originalAmount])).toEqual([
      [day(2030, 3, 2), day(2030, 4, 10), 1286.71, 1286.71],
      [day(2030, 3, 4), day(2030, 4, 10), 83.29, 83.29],
    ])
  })

  it('needs the billing-date column when the source is "column"', () => {
    const m = suggestMapping(sheet, 'card')
    const { billingDate: _b, ...columns } = m.columns
    expect(missingFields({ ...m, columns }, 'card')).toEqual(['billingDate'])
  })
})

describe('a card export with no billing date anywhere (e.g. Isracard)', () => {
  const sheet = sheetOf(
    Buffer.from(['תאריך רכישה,שם בית עסק,סכום עסקה,סכום חיוב,פירוט נוסף', '08/10/2030,עסק בדוי,40,40,', '15/10/2030,עסק בדוי אחר,25,25,', '04/07/2030,חנות בדויה,300,100,תשלום 3 מתוך 3'].join('\n')),
    'fake.csv'
  )

  it('suggests a billing day that is not set yet, so the billing date is missing', () => {
    const m = suggestMapping(sheet, 'card')
    expect(m.billingDate).toEqual({ from: 'day' })
    expect(missingFields(m, 'card')).toEqual(['billingDate'])
    expect(applyMapping(sheet, m, 'card').errors).toEqual([{ row: -1, field: 'billingDate', message: 'לא נקבע יום החיוב' }])
  })

  it('once the day is set, each row is billed on the next billing day after its purchase', () => {
    const m: ImportMapping = { ...suggestMapping(sheet, 'card'), billingDate: { from: 'day', day: 10 } }
    expect(missingFields(m, 'card')).toEqual([])
    const { rows, errors, pending } = applyMapping(sheet, m, 'card')
    expect(errors).toEqual([])
    expect(pending).toBe(0)
    expect(rows.map(r => r.billingDate)).toEqual([day(2030, 10, 10), day(2030, 11, 10), day(2030, 9, 10)])
  })
})

describe('voucher number and the two currencies (Isracard-shaped headers)', () => {
  const sheet = sheetOf(
    Buffer.from(
      [
        "תאריך רכישה,שם בית עסק,סכום עסקה,מטבע עסקה,סכום חיוב,מטבע חיוב,מס' שובר,פירוט נוסף",
        '02/08/2030,חנות בדויה בחו"ל,25.00,$,92.40,₪,100245,',
        '05/08/2030,תחנת דלק בדויה,250.00,₪,250.00,₪,100478,',
      ].join('\n')
    ),
    'fake.csv'
  )

  it('suggests every column, the voucher number as the reference', () => {
    expect(suggestMapping(sheet, 'card').columns).toEqual({
      transactionDate: 0,
      merchant: 1,
      originalAmount: 2,
      originalCurrency: 3,
      chargedAmount: 4,
      chargedCurrency: 5,
      reference: 6,
      notes: 7,
    })
  })

  it('reads them into each row', () => {
    const m: ImportMapping = { ...suggestMapping(sheet, 'card'), billingDate: { from: 'day', day: 10 } }
    const { rows, errors } = applyMapping(sheet, m, 'card')
    expect(errors).toEqual([])
    expect(rows.map(r => [r.originalAmount, r.originalCurrency, r.chargedAmount, r.chargedCurrency, r.reference])).toEqual([
      [25, '$', 92.4, '₪', '100245'],
      [250, '₪', 250, '₪', '100478'],
    ])
  })

  it('a file without them: no reference, charged in ₪', () => {
    const plain = sheetOf(cardWithBillingColumnCsv(), 'fake.csv')
    const row = applyMapping(plain, suggestMapping(plain, 'card'), 'card').rows[0]
    expect(row).toMatchObject({ reference: '', chargedCurrency: '₪' })
  })
})

describe('a mapping saved before the reference and charged currency existed', () => {
  const sheet = sheetOf(
    Buffer.from(["תאריך רכישה,שם בית עסק,סכום עסקה,מטבע עסקה,סכום חיוב,מטבע חיוב,מס' שובר,פירוט נוסף", '05/08/2030,תחנת דלק בדויה,250.00,₪,250.00,₪,100478,'].join('\n')),
    'fake.csv'
  )
  const { reference: _r, chargedCurrency: _c, ...older } = suggestMapping(sheet, 'card').columns
  const saved: ImportMapping = { ...suggestMapping(sheet, 'card'), columns: older, billingDate: { from: 'day', day: 10 } }

  it('picks up their columns from the file', () => {
    const m = withLaterFields(sheet, saved, 'card')
    expect(m.columns).toMatchObject({ reference: 6, chargedCurrency: 5 })
    expect(applyMapping(sheet, m, 'card').rows[0]).toMatchObject({ reference: '100478', chargedCurrency: '₪' })
  })

  it('keeps everything else, and leaves a column already used for another field', () => {
    const taken: ImportMapping = { ...saved, columns: { ...older, notes: 6 } }
    const m = withLaterFields(sheet, taken, 'card')
    expect(m.columns.notes).toBe(6)
    expect(m.columns.reference).toBeUndefined()
    expect(m.columns.chargedCurrency).toBe(5)
    expect(m.billingDate).toEqual({ from: 'day', day: 10 })
  })

  it('is the same mapping when there is nothing to add', () => {
    const full = suggestMapping(sheet, 'card')
    expect(withLaterFields(sheet, full, 'card')).toBe(full)
  })
})

describe('validateMapping and the billing day', () => {
  const sheet = sheetOf(cardWithBillingColumnCsv(), 'fake.csv')
  const base = suggestMapping(sheet, 'card')

  it('keeps a billing day and an optional closing day', () => {
    expect(validateMapping({ ...base, billingDate: { from: 'day', day: 2, closesOn: 28 } }, 'card')).toMatchObject({
      ok: true,
      mapping: { billingDate: { from: 'day', day: 2, closesOn: 28 } },
    })
    expect(validateMapping({ ...base, billingDate: { from: 'day', day: 15 } }, 'card')).toMatchObject({
      ok: true,
      mapping: { billingDate: { from: 'day', day: 15 } },
    })
  })

  it('turns a fixed date saved before the billing day into that date’s day of the month', () => {
    expect(validateMapping({ ...base, billingDate: { from: 'fixed', date: '2030-10-10' } }, 'card')).toMatchObject({
      ok: true,
      mapping: { billingDate: { from: 'day', day: 10 } },
    })
  })
})

describe('per-row validation', () => {
  const sheet = sheetOf(
    Buffer.from(['תאריך עסקה,שם בית עסק,סכום חיוב', '01/01/2030,עסק בדוי,abc', '02/01/2030,,5', 'סיכום,,5'].join('\n')),
    'fake.csv'
  )
  const m: ImportMapping = { ...suggestMapping(sheet, 'card'), billingDate: { from: 'day', day: 10 } }

  it('reports each bad cell with its row and field', () => {
    const { rows, errors } = applyMapping(sheet, m, 'card')
    expect(rows).toEqual([])
    expect(errors).toEqual([
      { row: 1, field: 'chargedAmount', message: expect.any(String) },
      { row: 2, field: 'merchant', message: expect.any(String) },
    ])
  })

  it('turns rows without a date into errors when skipping is off', () => {
    const { errors } = applyMapping(sheet, { ...m, skipInvalid: false }, 'card')
    expect(errors.map(e => [e.row, e.field])).toContainEqual([3, 'transactionDate'])
  })

  it('stops at endRow', () => {
    const { errors } = applyMapping(sheet, { ...m, endRow: 1 }, 'card')
    expect(errors.map(e => e.row)).toEqual([1])
  })
})

describe('a bank export with one signed amount', () => {
  const sheet = sheetOf(bankSignedCsv(), 'fake.csv')

  it('suggests the signed amount with negative = money out', () => {
    const m = suggestMapping(sheet, 'bank')
    expect(m.headerRow).toBe(1)
    expect(m.columns).toEqual({ date: 0, description: 1, amount: 2, balance: 3 })
    expect(m.amountMode).toBe('signed')
    expect(m.expensesNegative).toBe(true)
  })

  it('splits it into debit and credit', () => {
    const { rows, errors } = applyMapping(sheet, suggestMapping(sheet, 'bank'), 'bank', { fileName: 'b.csv' })
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { date: day(2030, 1, 2), originalDescription: 'משכורת בדויה', description: 'משכורת בדויה', debit: 0, credit: 5317.43, balance: 5421.15, note: '', reference: '', sourceFile: 'b.csv' },
      { date: day(2030, 1, 3), originalDescription: 'סופר בדוי', description: 'סופר בדוי', debit: 127.83, credit: 0, balance: 5293.32, note: '', reference: '', sourceFile: 'b.csv' },
    ])
  })

  it('needs debit or credit in split mode, and the amount in signed mode', () => {
    const m = suggestMapping(sheet, 'bank')
    expect(missingFields({ ...m, amountMode: 'split' }, 'bank')).toEqual(['debit'])
    expect(missingFields({ ...m, columns: { date: 0, description: 1 } }, 'bank')).toEqual(['amount'])
  })
})

describe('validateMapping', () => {
  const sheet = sheetOf(calXlsx())
  const good = suggestMapping(sheet, 'card')

  it('accepts a suggestion and returns a clean copy', () => {
    const res = validateMapping(JSON.parse(JSON.stringify({ ...good, extra: 'ignored' })), 'card')
    expect(res).toEqual({ ok: true, mapping: good })
  })

  it('rejects malformed input', () => {
    const bad: unknown[] = [
      null,
      'x',
      { ...good, headerRow: -1 },
      { ...good, headerRow: 1.5 },
      { ...good, columns: { ...good.columns, merchant: 'b' } },
      { ...good, columns: { ...good.columns, nope: 3 } },
      { ...good, columns: { ...good.columns, notes: 0 } }, // same column twice
      { ...good, columns: { ...good.columns, notes: 10_000 } },
      { ...good, dateFormat: 'YY' },
      { ...good, number: { decimal: ',', thousands: ',' } },
      { ...good, billingDate: { from: 'cell', row: 2 } },
      { ...good, billingDate: { from: 'cell', row: 2, col: 0, pattern: '(' } },
      { ...good, billingDate: { from: 'cell', row: 2, col: 0, pattern: 'x'.repeat(201) } },
      { ...good, billingDate: { from: 'fixed', date: '2030-13-01' } },
      { ...good, billingDate: { from: 'day', day: 0 } },
      { ...good, billingDate: { from: 'day', day: 32 } },
      { ...good, billingDate: { from: 'day', day: 1.5 } },
      { ...good, billingDate: { from: 'day', day: 10, closesOn: 40 } },
      { ...good, billingDate: { from: 'day' } }, // the day not chosen yet
      { ...good, startRow: 2 }, // before the header
    ]
    for (const input of bad) expect(validateMapping(input, 'card').ok, JSON.stringify(input)).toBe(false)
  })

  it('rejects a mapping without the required fields', () => {
    const { merchant: _m, ...columns } = good.columns
    const res = validateMapping({ ...good, columns }, 'card')
    expect(res.ok).toBe(false)
  })
})

describe('Leumi and Max exports (no built-in readers: the mapper finds the columns by name)', () => {
  it('Max: every column is suggested and the row reads in full', () => {
    const sheet = sheetOf(maxXlsx())
    const m = suggestMapping(sheet, 'card')
    expect(m.headerRow).toBe(3)
    expect(m.billingDate).toEqual({ from: 'column' })
    expect(missingFields(m, 'card')).toEqual([])
    const mapped = applyMapping(sheet, m, 'card')
    expect(mapped.errors).toEqual([])
    expect(mapped.rows).toHaveLength(1)
    expect(mapped.rows[0]).toMatchObject({
      transactionDate: day(2030, 1, 7),
      billingDate: day(2030, 2, 10),
      originalMerchantName: 'עסק בדוי',
      merchantName: 'עסק בדוי',
      category: 'קטגוריה בדויה',
      chargedAmount: 15,
      originalAmount: 15,
      originalCurrency: '₪',
      cardLastFour: '0000',
      transactionType: 'רגילה',
    })
  })

  const leumi = (extra: boolean) =>
    Buffer.from(`<HTML dir="RTL"><body>
<table><tr><td>תנועות בחשבון</td></tr>
<tr><td>תאריך</td>${extra ? '<td>תאריך ערך</td>' : ''}<td>תיאור</td>${extra ? '<td>אסמכתא</td>' : ''}<td>בחובה</td><td>בזכות</td><td>היתרה בש"ח</td><td>הערה</td></tr>
<tr><td>05/01/2030</td>${extra ? '<td>06/01/2030</td>' : ''}<td>חנות בדויה</td>${extra ? '<td>12345</td>' : ''}<td>1,212.00</td><td>0.00</td><td>100.00</td><td></td></tr>
<tr><td>06/01/2030</td>${extra ? '<td>06/01/2030</td>' : ''}<td>הפקדה בדויה</td>${extra ? '<td>678</td>' : ''}<td>0.00</td><td>31.17</td><td>131.17</td><td>הערה בדויה</td></tr>
</table></body></HTML>`)

  const LEUMI_ROWS = [
    { date: day(2030, 1, 5), originalDescription: 'חנות בדויה', description: 'חנות בדויה', debit: 1212, credit: 0, balance: 100 },
    { date: day(2030, 1, 6), originalDescription: 'הפקדה בדויה', description: 'הפקדה בדויה', debit: 0, credit: 31.17, balance: 131.17, note: 'הערה בדויה' },
  ]

  it('Leumi: the usual six columns read in full', () => {
    const sheet = sheetOf(leumi(false), 'bank-fake.xls')
    const m = suggestMapping(sheet, 'bank')
    expect(m.amountMode).toBe('split')
    const mapped = applyMapping(sheet, m, 'bank', { fileName: 'bank-fake.xls' })
    expect(mapped.errors).toEqual([])
    expect(mapped.rows).toMatchObject(LEUMI_ROWS)
  })

  it('Leumi: an export with value date and reference columns reads the same rows', () => {
    const sheet = sheetOf(leumi(true), 'bank-fake.xls')
    const m = suggestMapping(sheet, 'bank')
    // the transaction date, not the value date; the אסמכתא is the reference, not an amount
    expect(m.columns).toMatchObject({ date: 0, description: 2, reference: 3, debit: 4, credit: 5, balance: 6, note: 7 })
    const mapped = applyMapping(sheet, m, 'bank', { fileName: 'bank-fake.xls' })
    expect(mapped.errors).toEqual([])
    expect(mapped.rows).toMatchObject(LEUMI_ROWS)
    expect(mapped.rows.map(r => r.reference)).toEqual(['12345', '678'])
  })
})
