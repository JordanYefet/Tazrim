import { describe, expect, it } from 'vitest'
import { checkMapping, defaultProfileName, fieldOfColumn, setColumnField } from '../mapping-state'
import { suggestMapping, withHeaderRow } from '@/lib/import/mapping'
import { bankSignedCsv, calXlsx, sheetOf } from '@/lib/import/__tests__/fixtures'

// All values are made up.

const cal = sheetOf(calXlsx())
const bank = sheetOf(bankSignedCsv(), 'b.csv')

describe('setColumnField', () => {
  it('moves a field off the column it was on, and ignores a column', () => {
    const m = suggestMapping(cal, 'card')
    const moved = setColumnField(m, 'card', 2, 'chargedAmount')
    expect(moved.columns.chargedAmount).toBe(2)
    expect(moved.columns.originalAmount).toBeUndefined()
    expect(fieldOfColumn(moved, 3)).toBeUndefined()
    expect(setColumnField(m, 'card', 6, null).columns.notes).toBeUndefined()
  })

  it('switches a bank mapping between one signed amount and debit/credit', () => {
    const m = suggestMapping(bank, 'bank')
    const split = setColumnField(m, 'bank', 2, 'debit')
    expect(split.amountMode).toBe('split')
    expect(split.columns).toEqual({ date: 0, description: 1, debit: 2, balance: 3 })
    const signed = setColumnField(split, 'bank', 2, 'amount')
    expect(signed).toMatchObject({ amountMode: 'signed', expensesNegative: true })
    expect(signed.columns).toEqual({ date: 0, description: 1, amount: 2, balance: 3 })
  })

  it('a billing-date column becomes the billing-date source', () => {
    const m = setColumnField(suggestMapping(cal, 'card'), 'card', 6, 'billingDate')
    expect(m.billingDate).toEqual({ from: 'column' })
  })
})

describe('withHeaderRow', () => {
  it('re-reads columns from the new header row, and keeps them when it names nothing', () => {
    const m = suggestMapping(cal, 'card')
    const wrong = withHeaderRow(cal, m, 'card', 0)
    expect(wrong.headerRow).toBe(0)
    expect(wrong.columns).toEqual(m.columns)
    expect(withHeaderRow(cal, wrong, 'card', 3)).toEqual(m)
  })
})

describe('checkMapping', () => {
  it('is ready for a clean mapping', () => {
    const { reason, result } = checkMapping(cal, suggestMapping(cal, 'card'), 'card')
    expect(reason).toBeNull()
    expect(result.rows).toHaveLength(3)
  })

  it('names what is missing or wrong', () => {
    const m = suggestMapping(cal, 'card')
    const noMerchant = checkMapping(cal, setColumnField(m, 'card', 1, null), 'card')
    expect(noMerchant.reason).toContain('בית עסק')
    expect(noMerchant.fix).toBe('columns')
    const noBilling = checkMapping(cal, { ...m, billingDate: { from: 'column' } }, 'card')
    expect(noBilling.reason).toContain('תאריך חיוב')
    expect(noBilling.fix).toBe('billing')
    // a billing day that is not chosen yet is missing the same way
    expect(checkMapping(cal, { ...m, billingDate: { from: 'day' } }, 'card')).toMatchObject({ fix: 'billing' })
    expect(checkMapping(cal, { ...m, billingDate: { from: 'day', day: 10, closesOn: 31 } }, 'card').reason).toBeNull()
    expect(checkMapping(cal, { ...m, billingDate: { from: 'cell', row: 0, col: 0 } }, 'card').reason).toContain('תאריך חיוב')
    expect(checkMapping(cal, setColumnField(m, 'card', 4, 'chargedAmount'), 'card').reason).toMatch(/שגיא/)
    expect(checkMapping(undefined, m, 'card').reason).not.toBeNull()
  })
})

it('defaultProfileName', () => {
  expect(defaultProfileName('כאל', 'card')).toBe('כאל – פירוט עסקאות')
  expect(defaultProfileName('בנק', 'bank')).toBe('בנק – תנועות בחשבון')
})
