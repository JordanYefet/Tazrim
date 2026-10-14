import { describe, expect, it } from 'vitest'
import { cardDedupeKey, installmentOf, planCardImport, type CardKeyFields } from '../card-dedupe'

// Made-up rows only
const row = (over: Partial<CardKeyFields> = {}): CardKeyFields => ({
  transactionDate: new Date(2030, 0, 5),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'FAKE STORE',
  chargedAmount: 100,
  notes: '',
  ...over,
})

describe('installmentOf', () => {
  it('reads "N מתוך M" from the notes', () => {
    expect(installmentOf('תשלום 3 מתוך 10')).toEqual({ number: 3, of: 10 })
    expect(installmentOf('  תשלום 12 מתוך 12 ')).toEqual({ number: 12, of: 12 })
  })

  it('is null for notes that are not an installment', () => {
    expect(installmentOf('')).toBeNull()
    expect(installmentOf('הוראת קבע')).toBeNull()
    expect(installmentOf('למי: מתנה')).toBeNull()
  })
})

describe('cardDedupeKey', () => {
  it('is the same for the same charge on the same statement', () => {
    expect(cardDedupeKey(row())).toBe(cardDedupeKey(row()))
  })

  it('tells installments of one purchase apart', () => {
    // MAX repeats the purchase date and amount on every installment
    const third = row({ billingDate: new Date(2030, 2, 2), notes: 'תשלום 3 מתוך 10' })
    const fourth = row({ billingDate: new Date(2030, 3, 2), notes: 'תשלום 4 מתוך 10' })
    expect(cardDedupeKey(third)).not.toBe(cardDedupeKey(fourth))
  })

  it('tells two installments apart even if they are billed on the same day', () => {
    const a = row({ notes: 'תשלום 5 מתוך 10' })
    const b = row({ notes: 'תשלום 10 מתוך 10' })
    expect(cardDedupeKey(a)).not.toBe(cardDedupeKey(b))
  })

  it('tells the same charge on different statements apart', () => {
    expect(cardDedupeKey(row({ billingDate: new Date(2030, 1, 2) }))).not.toBe(
      cardDedupeKey(row({ billingDate: new Date(2030, 2, 2) }))
    )
  })

  it('ignores free-text notes that are not installments', () => {
    expect(cardDedupeKey(row({ notes: 'הוראת קבע' }))).toBe(cardDedupeKey(row({ notes: '' })))
  })
})

describe('planCardImport', () => {
  it('creates rows that are not stored yet and skips the ones that are', () => {
    const stored = [{ id: 's1', ...row() }]
    const incoming = [row(), row({ originalMerchantName: 'OTHER FAKE' })]
    expect(planCardImport(incoming, stored)).toEqual({ create: [1], skip: [{ index: 0, matchedId: 's1' }] })
  })

  it('matches one-to-one: a charge twice in the file and once in the DB adds one row', () => {
    const stored = [{ id: 's1', ...row() }]
    expect(planCardImport([row(), row()], stored)).toEqual({ create: [1], skip: [{ index: 0, matchedId: 's1' }] })
  })

  it('keeps every repeat of a charge when none is stored', () => {
    expect(planCardImport([row(), row()], [])).toEqual({ create: [0, 1], skip: [] })
  })

  it('imports forced rows even when they match', () => {
    const stored = [{ id: 's1', ...row() }]
    expect(planCardImport([row()], stored, [0])).toEqual({ create: [0], skip: [] })
  })
})
