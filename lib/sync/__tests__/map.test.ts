import { describe, expect, it } from 'vitest'
import { currencySymbol, installmentNote, israelDay, lastFour, mapBankAccount, mapCardAccount, type ScrapedTransaction } from '../map'
import { validateCredentials, syncCompany } from '../providers'

// Made-up merchants, amounts and account numbers only.
const tx = (over: Partial<ScrapedTransaction>): ScrapedTransaction => ({
  type: 'normal',
  date: '2030-03-10T00:00:00.000',
  processedDate: '2030-04-02T00:00:00.000',
  originalAmount: -10,
  originalCurrency: 'ILS',
  chargedAmount: -10,
  description: 'Fake Shop',
  status: 'completed',
  ...over,
})

describe('israelDay', () => {
  it('reads the Israeli calendar day of a UTC instant (midnight in Israel is the evening before in UTC)', () => {
    const d = israelDay('2030-03-09T22:00:00.000Z')!
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2030, 3, 10, 0])
  })
  it('is null for a date it cannot read', () => {
    expect(israelDay('not a date')).toBeNull()
  })
})

describe('small helpers', () => {
  it('turns currency codes into the symbols the files use', () => {
    expect(currencySymbol('ILS')).toBe('₪')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol(undefined)).toBe('₪')
    expect(currencySymbol('CHF')).toBe('CHF')
  })
  it('writes installments the way card-dedupe reads them', () => {
    expect(installmentNote({ number: 2, total: 3 })).toBe('תשלום 2 מתוך 3')
    expect(installmentNote({ number: 1, total: 1 })).toBe('')
  })
  it('takes the last four digits of a card number', () => {
    expect(lastFour('1234')).toBe('1234')
    expect(lastFour('****-9876')).toBe('9876')
  })
})

describe('mapBankAccount', () => {
  it('orders rows oldest first, splits debit and credit, leaves pending out, and works the balance back from today', () => {
    const res = mapBankAccount(
      {
        accountNumber: '000-000000/00',
        balance: 1000,
        txns: [
          tx({ date: '2030-03-12T00:00:00.000', chargedAmount: -50, identifier: 7 }),
          tx({ date: '2030-03-10T00:00:00.000', chargedAmount: 300, description: ' Fake Salary ' }),
          tx({ date: '2030-03-13T00:00:00.000', chargedAmount: -5, status: 'pending' }),
        ],
      },
      'sync-leumi-2030-03-13'
    )
    expect(res.pending).toBe(1)
    expect(res.balanceKnown).toBe(true)
    expect(res.rows.map(r => [r.description, r.debit, r.credit, r.balance, r.reference])).toEqual([
      ['Fake Salary', 0, 300, 1050, ''],
      ['Fake Shop', 50, 0, 1000, '7'],
    ])
    expect(res.rows[0].sourceFile).toBe('sync-leumi-2030-03-13')
  })

  it('carries the balance forward from the stored one when the site gives none', () => {
    const res = mapBankAccount({ accountNumber: '1', txns: [tx({ chargedAmount: -20 }), tx({ chargedAmount: 5 })] }, 'f', 100)
    expect(res.rows.map(r => r.balance)).toEqual([80, 85])
  })

  it('says when no balance could be worked out', () => {
    expect(mapBankAccount({ accountNumber: '1', txns: [tx({})] }, 'f').balanceKnown).toBe(false)
  })
})

describe('mapCardAccount', () => {
  it('makes charges positive, refunds negative, and keeps installments and the card digits', () => {
    const res = mapCardAccount({
      accountNumber: '4321',
      txns: [
        tx({ chargedAmount: -100, originalAmount: -300, type: 'installments', installments: { number: 1, total: 3 }, memo: 'Fake memo' }),
        tx({ chargedAmount: 25, originalAmount: 25, description: 'Fake Refund' }),
        tx({ originalCurrency: 'USD', originalAmount: -12.5, chargedAmount: -45, category: 'Fake Category' }),
        tx({ status: 'pending' }),
      ],
    })
    expect(res.pending).toBe(1)
    const [inst, refund, foreign] = res.rows
    expect(inst).toMatchObject({ chargedAmount: 100, originalAmount: 300, notes: 'תשלום 1 מתוך 3 · Fake memo', transactionType: 'תשלומים', cardLastFour: '4321' })
    expect(inst.billingDate.getMonth() + 1).toBe(4)
    expect(refund.chargedAmount).toBe(-25)
    expect(foreign).toMatchObject({ originalCurrency: '$', originalAmount: 12.5, chargedAmount: 45, chargedCurrency: '₪', category: 'Fake Category' })
  })
})

describe('validateCredentials', () => {
  const max = syncCompany('max')!
  it('keeps exactly the company fields', () => {
    expect(validateCredentials(max, { username: ' someone ', password: ' p ', extra: 'x' })).toEqual({ username: 'someone', password: ' p ' })
  })
  it('refuses a missing or empty field', () => {
    expect(validateCredentials(max, { username: 'someone' })).toBeNull()
    expect(validateCredentials(max, { username: '  ', password: 'p' })).toBeNull()
    expect(validateCredentials(max, null)).toBeNull()
  })
})
