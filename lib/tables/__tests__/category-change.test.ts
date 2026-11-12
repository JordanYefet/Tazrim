import { describe, expect, it } from 'vitest'
import {
  applyChange,
  bankChangeHits,
  cardChangeHits,
  idsChange,
  keysChange,
  resultChangeHits,
  resultKey,
} from '../category-change'

const card = (id: string, originalMerchantName: string, cardId: string) => ({ id, originalMerchantName, cardId, categoryOverride: null as string | null })

describe('applyChange', () => {
  it('patches the rows the change hits and keeps the others as they are', () => {
    const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }]
    const out = applyChange(rows, idsChange(['a', 'c'], r => ({ ...r, v: 0 })))
    expect(out.map(r => r.v)).toEqual([0, 2, 0])
    expect(out[1]).toBe(rows[1])
  })

  it('an empty id set changes nothing', () => {
    const rows = [{ id: 'a' }]
    expect(applyChange(rows, idsChange([], r => ({ ...r, id: 'z' })))).toEqual(rows)
  })
})

describe('cardChangeHits', () => {
  const rows = [card('1', 'SUPER YODA', 'max-1'), card('2', 'SUPER YODA', 'max-2'), card('3', 'SUPER YODA', 'cal-1'), card('4', 'PIZZA', 'max-1')]
  const companyOf = (r: { cardId: string }) => r.cardId.split('-')[0]

  it("'row' reaches the charge alone", () => {
    expect(rows.filter(cardChangeHits(rows[0], 'row', companyOf)).map(r => r.id)).toEqual(['1'])
  })

  it("'merchant' reaches the merchant's charges on the company's cards, not another company's", () => {
    expect(rows.filter(cardChangeHits(rows[0], 'merchant', companyOf)).map(r => r.id)).toEqual(['1', '2'])
  })

  it("'contains' reaches the charge alone until the server answers", () => {
    expect(rows.filter(cardChangeHits(rows[0], 'contains', companyOf)).map(r => r.id)).toEqual(['1'])
  })
})

describe('bankChangeHits', () => {
  const bank = (id: string, originalDescription: string, debit: number, credit: number, categoryManual = false) => ({
    id,
    originalDescription,
    debit,
    credit,
    categoryManual,
  })
  const rows = [
    bank('1', 'חשמל', 240, 0),
    bank('2', 'חשמל', 180, 0),
    bank('3', 'חשמל', 0, 50), // a refund: money in
    bank('4', 'חשמל', 310, 0, true), // picked by hand: a rule leaves it
    bank('5', 'מים', 90, 0),
  ]

  it("'row' reaches the row alone", () => {
    expect(rows.filter(bankChangeHits(rows[0], 'row')).map(r => r.id)).toEqual(['1'])
  })

  it("'rule' reaches the same text going the same way, except rows with a category of their own", () => {
    expect(rows.filter(bankChangeHits(rows[0], 'rule')).map(r => r.id)).toEqual(['1', '2'])
  })

  it("'rule' from a manual row still reaches that row", () => {
    expect(rows.filter(bankChangeHits(rows[3], 'rule')).map(r => r.id)).toEqual(['1', '2', '4'])
  })

  it("'contains' reaches the row alone until the server answers", () => {
    expect(rows.filter(bankChangeHits(rows[1], 'contains')).map(r => r.id)).toEqual(['2'])
  })
})

describe('resultChangeHits', () => {
  const result = (id: string, source: string, accountId: string, description: string, originalDescription?: string) => ({
    id,
    source,
    accountId,
    description,
    originalDescription,
  })
  const rows = [
    result('1', 'card', 'max-1', 'סופר', 'SUPER YODA'),
    result('2', 'card', 'max-1', 'סופר', 'SUPER YODA'),
    result('3', 'card', 'cal-1', 'סופר', 'SUPER YODA'),
    result('1', 'bank', 'leumi', 'סופר'),
    result('4', 'bank', 'leumi', 'סופר'),
  ]

  it('a narrow save reaches the row, told apart from another source with the same id', () => {
    expect(rows.filter(resultChangeHits(rows[0], false))).toEqual([rows[0]])
  })

  it("a wide save reaches the account's rows with the same original text", () => {
    expect(rows.filter(resultChangeHits(rows[0], true)).map(r => `${r.source}:${r.id}`)).toEqual(['card:1', 'card:2'])
    expect(rows.filter(resultChangeHits(rows[3], true)).map(r => `${r.source}:${r.id}`)).toEqual(['bank:1', 'bank:4'])
  })

  it('keysChange reaches the rows the server named', () => {
    const out = applyChange(rows, keysChange(['bank:4', 'card:3'], r => ({ ...r, description: 'x' })))
    expect(out.filter(r => r.description === 'x').map(resultKey)).toEqual(['card:3', 'bank:4'])
  })
})
