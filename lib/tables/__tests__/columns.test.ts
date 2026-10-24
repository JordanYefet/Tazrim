import { describe, expect, it } from 'vitest'
import { BANK_COLUMNS, CARD_COLUMNS, columnsCookie, formatColumns, parseColumns } from '../columns'

describe('optional table columns', () => {
  it('reads the chosen columns from the cookie, in the table’s order, unknown ones dropped', () => {
    expect(parseColumns('notes,reference', 'card')).toEqual(['reference', 'notes'])
    expect(parseColumns('reference,nope,balance', 'bank')).toEqual(['reference'])
    expect(parseColumns('chargedCurrency', 'bank')).toEqual([])
  })

  it('shows none of them when there is no cookie', () => {
    expect(parseColumns(undefined, 'card')).toEqual([])
    expect(parseColumns('', 'bank')).toEqual([])
  })

  it('writes them back the same way', () => {
    expect(parseColumns(formatColumns(['notes', 'reference']), 'card')).toEqual(['reference', 'notes'])
    expect(columnsCookie('card')).not.toBe(columnsCookie('bank'))
  })

  it('every column has a label', () => {
    for (const c of [...CARD_COLUMNS, ...BANK_COLUMNS]) expect(c.label.length).toBeGreaterThan(0)
  })
})
