import { describe, expect, it } from 'vitest'
import {
  collectPayerEvidence,
  inName,
  payerCountHint,
  payerReason,
  rankPayers,
  shortDate,
  suggestPayer,
  toName,
  type PayerEvidence,
  type PayerPaymentRow,
} from '../payer-suggestion'

// All values are made up.
const TODAY = '2026-11-01'
const row = (accountId: string, date: string, description: string, debit = 100): PayerPaymentRow => ({ accountId, date, description, debit })
const monthly = (accountId: string, description: string, months: string[], debit = 100) =>
  months.map(m => row(accountId, `${m}-10`, description, debit))

describe('collectPayerEvidence', () => {
  it('counts a year of payments per bank account and company, with the latest one', () => {
    const rows = [
      ...monthly('bankA', 'מקס איט פיננסים', ['2026-08', '2026-09', '2026-10']),
      row('bankA', '2026-10-10', 'מקס איט פיננסים', 250),
      row('bankA', '2025-10-01', 'מקס איט פיננסים'), // more than a year ago
      row('bankB', '2026-10-02', 'כרטיסי אשראי לישראל', 80),
    ]
    const ev = collectPayerEvidence(rows, TODAY)
    expect(ev).toEqual(
      expect.arrayContaining([
        { bankAccountId: 'bankA', provider: 'max', count: 4, everyMonth: true, lastDate: '2026-10-10', lastAmount: 250 },
        { bankAccountId: 'bankB', provider: 'cal', count: 1, everyMonth: false, lastDate: '2026-10-02', lastAmount: 80 },
      ])
    )
  })

  it('skips credits, generic descriptions and other rows', () => {
    const rows = [row('bankA', '2026-10-10', 'מקס איט פיננסים', 0), row('bankA', '2026-10-10', 'כרטיס אשראי'), row('bankA', '2026-10-10', 'סופר')]
    expect(collectPayerEvidence(rows, TODAY)).toEqual([])
  })

  it('keeps an old payer, with no count, and says "every month" only for a recent unbroken run', () => {
    const old = collectPayerEvidence([row('bankA', '2024-03-10', 'ישראכרט')], TODAY)
    expect(old).toEqual([{ bankAccountId: 'bankA', provider: 'isracard', count: 0, everyMonth: false, lastDate: '2024-03-10', lastAmount: 100 }])
    const gap = collectPayerEvidence(monthly('bankA', 'ישראכרט', ['2026-06', '2026-08', '2026-09', '2026-10']), TODAY)
    expect(gap[0].everyMonth).toBe(false)
    const stale = collectPayerEvidence(monthly('bankA', 'ישראכרט', ['2026-03', '2026-04', '2026-05']), TODAY)
    expect(stale[0].everyMonth).toBe(false)
  })
})

const ev = (bankAccountId: string, provider: string, count: number, lastDate: string): PayerEvidence => ({
  bankAccountId,
  provider,
  count,
  everyMonth: false,
  lastDate,
  lastAmount: 100,
})

describe('rankPayers / suggestPayer', () => {
  const evidence = [ev('bankA', 'max', 3, '2026-10-10'), ev('bankB', 'max', 11, '2026-09-10'), ev('bankC', 'max', 11, '2026-10-01'), ev('bankA', 'cal', 2, '2026-10-02')]

  it('ranks by payments in the last year, then by the latest one', () => {
    expect(rankPayers(evidence, 'max').map(e => e.bankAccountId)).toEqual(['bankC', 'bankB', 'bankA'])
    expect(suggestPayer(evidence, 'cal')?.bankAccountId).toBe('bankA')
  })

  it('suggests only an eligible bank account, and nothing for an unpaid company', () => {
    expect(suggestPayer(evidence, 'max', ['bankA', 'bankB'])?.bankAccountId).toBe('bankB')
    expect(suggestPayer(evidence, 'max', [])).toBeNull()
    expect(suggestPayer(evidence, 'isracard')).toBeNull()
  })
})

describe('wording', () => {
  it('joins Hebrew prefixes, with a maqaf before Latin names', () => {
    expect(inName('בנק לאומי')).toBe('בבנק לאומי')
    expect(toName('מקס')).toBe('למקס')
    expect(inName('Test bank')).toBe('ב־Test bank')
  })

  it('writes short dates, with the year only when it differs', () => {
    expect(shortDate('2026-10-10', TODAY)).toBe('10.10')
    expect(shortDate('2025-03-05', TODAY)).toBe('5.3.2025')
  })

  it('explains the suggestion and the count', () => {
    const every = { ...ev('bankA', 'max', 12, '2026-10-10'), everyMonth: true }
    expect(payerReason(every, 'בנק לאומי', 'מקס', TODAY)).toMatch(/^בבנק לאומי יש תשלומים למקס כל חודש \(האחרון ⁨10\.10⁩, ⁨.*100.*⁩\)/)
    expect(payerReason(ev('bankA', 'max', 4, '2026-10-10'), 'חשבון אישי', 'מקס', TODAY)).toMatch(/^בחשבון אישי נמצאו 4 תשלומים למקס בשנה האחרונה/)
    expect(payerCountHint(ev('bankA', 'max', 12, '2026-10-10'), 'מקס', TODAY)).toBe('12 תשלומים למקס נמצאו בחשבון הזה בשנה האחרונה.')
    expect(payerCountHint(ev('bankA', 'max', 1, '2026-10-10'), 'מקס', TODAY)).toBe('תשלום אחד למקס נמצא בחשבון הזה בשנה האחרונה.')
  })
})
