import { describe, expect, it } from 'vitest'
import {
  balanceMismatch,
  fillBank,
  fillCard,
  matchBankByDayAndAmount,
  matchCardByDayAndAmount,
  type StoredBankRow,
  type StoredCardRow,
} from '../overlap'
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'

// Made-up descriptions, merchants and amounts only.
const day = (d: number) => new Date(2030, 2, d)
let ids = 0

const bankIn = (d: number, description: string, debit: number, balance = 0, credit = 0): ParsedBankTransaction => ({
  date: day(d),
  originalDescription: description,
  description,
  debit,
  credit,
  balance,
  note: '',
  sourceFile: 'sync-leumi-2030-03-20',
})
const bankStored = (d: number, description: string, debit: number, balance = 0, sourceFile = 'fake-export.xlsx'): StoredBankRow => ({
  id: `stored-${++ids}`,
  date: day(d),
  originalDescription: description,
  debit,
  credit: 0,
  balance,
  reference: '',
  note: '',
  sourceFile,
})

const cardIn = (d: number, merchant: string, amount: number, notes = ''): ParsedCCTransaction => ({
  transactionDate: day(d),
  billingDate: day(28),
  originalMerchantName: merchant,
  merchantName: merchant,
  category: '',
  chargedAmount: amount,
  originalAmount: amount,
  originalCurrency: '₪',
  cardLastFour: '1234',
  transactionType: '',
  notes,
  cardProvider: 'SYNC',
})
const cardStored = (d: number, merchant: string, amount: number, notes = '', sourceFile = 'fake-export.xlsx'): StoredCardRow => ({
  id: `stored-${++ids}`,
  transactionDate: day(d),
  billingDate: day(28),
  originalMerchantName: merchant,
  chargedAmount: amount,
  reference: '',
  notes,
  sourceFile,
})

describe('matchBankByDayAndAmount', () => {
  it('leaves out a row an uploaded file words differently, same day and amount', () => {
    const res = matchBankByDayAndAmount([bankIn(3, 'FAKE SHOP SITE WORDING', 50)], [bankStored(3, 'FAKE SHOP FILE WORDING', 50)])
    expect(res).toMatchObject({ keep: [], dropped: 1 })
  })

  it('keeps it when the amount or the day differs', () => {
    const stored = [bankStored(3, 'FAKE SHOP', 50)]
    expect(matchBankByDayAndAmount([bankIn(3, 'OTHER', 51)], stored).dropped).toBe(0)
    expect(matchBankByDayAndAmount([bankIn(4, 'OTHER', 50)], stored).dropped).toBe(0)
  })

  it('matches one-to-one: two real same-day same-amount rows and one uploaded keep one', () => {
    const res = matchBankByDayAndAmount([bankIn(3, 'A', 20), bankIn(3, 'B', 20)], [bankStored(3, 'C', 20)])
    expect(res.dropped).toBe(1)
    expect(res.keep).toHaveLength(1)
  })

  it('lets an exact match use up its stored row first, for the usual de-dup to skip', () => {
    // The exact row matches the stored one; the other has nothing left to match loosely
    const res = matchBankByDayAndAmount([bankIn(3, 'SAME', 20), bankIn(3, 'DIFFERENT', 20)], [bankStored(3, 'SAME', 20)])
    expect(res.dropped).toBe(0)
    expect(res.keep).toHaveLength(2)
  })

  it('never matches loosely against an earlier sync (it words things the same)', () => {
    const res = matchBankByDayAndAmount([bankIn(3, 'NEW WORDING', 50)], [bankStored(3, 'OLD', 50, 0, 'sync-leumi-2030-03-10')])
    expect(res.dropped).toBe(0)
  })
})

describe('matchCardByDayAndAmount', () => {
  it('leaves out a charge an uploaded file names differently', () => {
    expect(matchCardByDayAndAmount([cardIn(5, 'FAKE CAFE LTD', 30)], [cardStored(5, 'FAKE CAFE', 30)]).dropped).toBe(1)
  })

  it('tells installments of the same purchase apart', () => {
    const res = matchCardByDayAndAmount([cardIn(5, 'SITE NAME', 100, 'תשלום 2 מתוך 3')], [cardStored(5, 'FILE NAME', 100, 'תשלום 1 מתוך 3')])
    expect(res.dropped).toBe(0)
  })
})

describe('matched rows, for filling in (ENG-103)', () => {
  it('pairs a fetched row with the uploaded row it is, by day and amount or exactly', () => {
    const loose = bankStored(3, 'FILE WORDING', 50)
    const exact = bankStored(4, 'SAME', 20)
    const res = matchBankByDayAndAmount([bankIn(3, 'SITE WORDING', 50), bankIn(4, 'SAME', 20)], [loose, exact])
    expect(res.matched.map(m => [m.row.originalDescription, m.stored.id])).toEqual([
      ['SAME', exact.id],
      ['SITE WORDING', loose.id],
    ])
  })

  it('pairs nothing when the day and amount have more than one candidate, on either side', () => {
    const twoUploaded = matchBankByDayAndAmount([bankIn(3, 'A', 20)], [bankStored(3, 'X', 20), bankStored(3, 'Y', 20)])
    expect(twoUploaded).toMatchObject({ dropped: 1, matched: [] })
    const twoFetched = matchBankByDayAndAmount([bankIn(3, 'A', 20), bankIn(3, 'B', 20)], [bankStored(3, 'X', 20)])
    expect(twoFetched).toMatchObject({ dropped: 1, matched: [] })
  })

  it('never pairs with an earlier sync\'s row', () => {
    const res = matchBankByDayAndAmount([bankIn(3, 'SAME', 20)], [bankStored(3, 'SAME', 20, 0, 'sync-leumi-2030-03-10')])
    expect(res.matched).toEqual([])
  })

  it('pairs card charges, installments apart', () => {
    const stored = cardStored(5, 'FILE NAME', 100, 'תשלום 1 מתוך 3')
    const res = matchCardByDayAndAmount([cardIn(5, 'SITE NAME', 100, 'תשלום 1 מתוך 3')], [stored, cardStored(5, 'FILE NAME', 100, 'תשלום 2 מתוך 3')])
    expect(res.matched.map(m => m.stored.id)).toEqual([stored.id])
  })
})

describe('fillBank / fillCard', () => {
  it('fills only what the uploaded row leaves empty', () => {
    expect(fillBank({ reference: '111', note: 'FAKE NOTE' }, { reference: '', note: '' })).toEqual({ reference: '111', note: 'FAKE NOTE' })
    expect(fillBank({ reference: '111', note: 'FAKE NOTE' }, { reference: '999', note: '' })).toEqual({ note: 'FAKE NOTE' })
    expect(fillBank({ reference: '111', note: 'FAKE NOTE' }, { reference: '', note: 'MY OWN NOTE' })).toEqual({ reference: '111' })
    expect(fillCard({ reference: '222', notes: 'FAKE MEMO' }, { reference: '', notes: null })).toEqual({ reference: '222', notes: 'FAKE MEMO' })
    expect(fillCard({ reference: '222', notes: 'FAKE MEMO' }, { reference: '', notes: 'תשלום 1 מתוך 3' })).toEqual({ reference: '222' })
  })

  it('is null when there is nothing to add', () => {
    expect(fillBank({ reference: '', note: '' }, { reference: '', note: '' })).toBeNull()
    expect(fillBank({ reference: '111', note: 'A' }, { reference: '999', note: 'B' })).toBeNull()
    expect(fillCard({ reference: undefined, notes: '  ' }, { reference: '', notes: '' })).toBeNull()
  })
})

describe('balanceMismatch', () => {
  it('is null when the end-of-day balance is one the statement shows that day', () => {
    const incoming = [bankIn(3, 'A', 10, 990), bankIn(3, 'B', 40, 950)]
    const stored = [bankStored(3, 'B', 40, 960), bankStored(3, 'A', 10, 950)]
    expect(balanceMismatch(incoming, stored)).toBeNull()
  })

  it('reports the latest shared day and the difference', () => {
    const incoming = [bankIn(2, 'A', 10, 500), bankIn(4, 'B', 10, 700)]
    const stored = [bankStored(2, 'A', 10, 500), bankStored(4, 'B', 10, 650)]
    expect(balanceMismatch(incoming, stored)).toEqual({ day: '2030-03-04', difference: 50 })
  })

  it('ignores rounding and days the two do not share, and earlier syncs', () => {
    expect(balanceMismatch([bankIn(3, 'A', 10, 100.4)], [bankStored(3, 'A', 10, 100)])).toBeNull()
    expect(balanceMismatch([bankIn(3, 'A', 10, 100)], [bankStored(5, 'A', 10, 900)])).toBeNull()
    expect(balanceMismatch([bankIn(3, 'A', 10, 100)], [bankStored(3, 'A', 10, 900, 'sync-leumi-2030-03-01')])).toBeNull()
  })
})
