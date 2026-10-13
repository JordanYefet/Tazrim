import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'
import { cardBreakdown, cardLabel, monthTotal, netBalance, resolveCardParam } from '../../utils/year-summary'

// Two active banks, three active cards (two providers) and one archived account
// of each kind. Made-up values only.
let db: TestDb
let summary: typeof import('../summary')
let accounts: typeof import('../accounts')
let cards: typeof import('../cards')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 5),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'TEST SHOP',
  merchantName: 'TEST SHOP',
  category: 'Food',
  chargedAmount: 10,
  originalAmount: 10,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})

const bt = (over: Partial<ParsedBankTransaction>): ParsedBankTransaction => ({
  date: new Date(2030, 0, 5),
  originalDescription: 'TEST ROW',
  description: 'TEST ROW',
  debit: 0,
  credit: 0,
  balance: 0,
  note: '',
  sourceFile: 'bank-test.xls',
  ...over,
})

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","cardLastFour","archived","createdAt") VALUES
    ('t_bank2', 'BANK', 'otherbank', 'Test bank 2', NULL, false, 1900000000001),
    ('t_card2', 'CREDIT_CARD', 'max', 'Test card 2', '0001', false, 1900000000002),
    ('t_card3', 'CREDIT_CARD', 'hitech', 'Test card 3', NULL, false, 1900000000003),
    ('t_bank_old', 'BANK', 'otherbank', 'Old test bank', NULL, false, 1900000000004),
    ('t_card_old', 'CREDIT_CARD', 'max', 'Old test card', '0002', false, 1900000000005);`)
  usePrismaOn(db)
  summary = await import('../summary')
  accounts = await import('../accounts')
  cards = await import('../cards')
  const bank = await import('../bank')

  // Bank 1: January income 1000, spending 300 (of which 120 is the card payment)
  await bank.upsertBankTransactions(
    [
      bt({ originalDescription: 'SALARY', credit: 1000 }),
      bt({ originalDescription: 'RENT', debit: 180 }),
      bt({ originalDescription: 'CARD PAYMENT', debit: 120 }),
      bt({ date: new Date(2030, 1, 3), originalDescription: 'RENT', debit: 50 }),
    ],
    'acct_leumi'
  )
  await bank.upsertBankTransactions(
    [bt({ originalDescription: 'TRANSFER IN', credit: 200 }), bt({ originalDescription: 'FEE', debit: 80 })],
    't_bank2'
  )
  await bank.upsertBankTransactions([bt({ originalDescription: 'OLD', credit: 999, debit: 0 }), bt({ originalDescription: 'OLD OUT', debit: 777 })], 't_bank_old')

  await cards.upsertCCTransactions(
    [
      cc({ chargedAmount: 70 }),
      cc({ transactionDate: new Date(2030, 1, 9), originalMerchantName: 'TEST SHOP 2', chargedAmount: 15 }),
    ],
    'max-1.xlsx',
    'acct_max'
  )
  await cards.upsertCCTransactions([cc({ chargedAmount: 50, category: 'Fuel' })], 'max-2.xlsx', 't_card2')
  await cards.upsertCCTransactions([cc({ chargedAmount: 25, cardProvider: 'HITECH' })], 'hitech.xlsx', 't_card3')
  await cards.upsertCCTransactions([cc({ chargedAmount: 40 })], 'max-old.xlsx', 't_card_old')

  db.exec(`UPDATE "Account" SET "archived" = true WHERE "id" IN ('t_bank_old', 't_card_old');`)
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('activeAccountIds', () => {
  it('lists the non-archived accounts of a kind, oldest first', async () => {
    expect(await accounts.activeAccountIds('BANK')).toEqual(['acct_leumi', 't_bank2'])
    expect(await accounts.activeAccountIds('CREDIT_CARD')).toEqual(['acct_max', 't_card2', 't_card3'])
  })
})

describe('getYearSummary', () => {
  it('totals bank income and spending across the active bank accounts', async () => {
    const s = await summary.getYearSummary(2030)
    expect(s.bank[1]).toEqual({ income: 1200, expense: 380 })
    expect(s.bank[2]).toEqual({ income: 0, expense: 50 })
    expect(s.bank[3]).toEqual({ income: 0, expense: 0 })
  })

  it('totals card charges across every active card, whatever the provider', async () => {
    const s = await summary.getYearSummary(2030)
    expect(s.cards[1]).toBe(70 + 50 + 25)
    expect(s.cards[2]).toBe(15)
    expect(s.cards[3]).toBe(0)
  })

  it('keeps the legacy `max` series: every MAX card, archived ones included', async () => {
    const s = await summary.getYearSummary(2030)
    expect(s.max[1]).toBe(70 + 50 + 40)
    expect(s.max[2]).toBe(15)
  })

  it('breaks the year down per account, archived accounts included and flagged', async () => {
    const s = await summary.getYearSummary(2030)
    expect(Object.keys(s.byAccount)).toEqual(['acct_leumi', 'acct_max', 't_bank2', 't_card2', 't_card3', 't_bank_old', 't_card_old'])
    expect(s.byAccount.acct_leumi).toMatchObject({ kind: 'BANK', displayName: 'בנק לאומי', archived: false })
    expect(s.byAccount.acct_leumi.monthly[1]).toEqual({ income: 1000, expense: 300 })
    expect(s.byAccount.t_bank2.monthly[1]).toEqual({ income: 200, expense: 80 })
    expect(s.byAccount.t_card2).toMatchObject({ kind: 'CREDIT_CARD', provider: 'max', displayName: 'Test card 2', cardLastFour: '0001' })
    expect(s.byAccount.t_card2.monthly[1]).toBe(50)
    expect(s.byAccount.t_card3.monthly[1]).toBe(25)
    // Archived: data kept, left out of the totals above
    expect(s.byAccount.t_bank_old).toMatchObject({ archived: true })
    expect(s.byAccount.t_bank_old.monthly[1]).toEqual({ income: 999, expense: 777 })
    expect(s.byAccount.t_card_old.monthly[1]).toBe(40)
  })

  it('lists the active accounts in display order', async () => {
    const s = await summary.getYearSummary(2030)
    expect(s.accounts).toEqual({ bank: ['acct_leumi', 't_bank2'], cards: ['acct_max', 't_card2', 't_card3'] })
  })

  it('totals equal the sum of the active accounts', async () => {
    const s = await summary.getYearSummary(2030)
    for (let m = 1; m <= 12; m++) {
      const bankSum = s.accounts.bank.reduce(
        (acc, id) => {
          const v = s.byAccount[id].monthly[m] as { income: number; expense: number }
          return { income: acc.income + v.income, expense: acc.expense + v.expense }
        },
        { income: 0, expense: 0 }
      )
      expect(s.bank[m]).toEqual(bankSum)
      expect(s.cards[m]).toBe(s.accounts.cards.reduce((acc, id) => acc + (s.byAccount[id].monthly[m] as number), 0))
    }
  })

  it('never subtracts card charges from the net: net is bank income minus bank spending', async () => {
    const s = await summary.getYearSummary(2030)
    expect(netBalance(s, 1)).toBe(1200 - 380)
    expect(netBalance(s)).toBe(1200 - 380 - 50)
  })

  it('is empty, not missing, for a year without data', async () => {
    const s = await summary.getYearSummary(2031)
    expect(s.bank[1]).toEqual({ income: 0, expense: 0 })
    expect(s.cards[12]).toBe(0)
    expect(s.byAccount.t_card2.monthly[1]).toBe(0)
  })
})

describe('summary helpers', () => {
  it('monthTotal sums one month or the whole year', async () => {
    const s = await summary.getYearSummary(2030)
    expect(monthTotal(s.cards, 1)).toBe(145)
    expect(monthTotal(s.cards)).toBe(160)
  })

  it('cardBreakdown splits the card total per active card', async () => {
    const s = await summary.getYearSummary(2030)
    expect(cardBreakdown(s, 1)).toEqual([
      { id: 'acct_max', displayName: 'מקס', cardLastFour: null, total: 70 },
      { id: 't_card2', displayName: 'Test card 2', cardLastFour: '0001', total: 50 },
      { id: 't_card3', displayName: 'Test card 3', cardLastFour: null, total: 25 },
    ])
    const year = cardBreakdown(s)
    expect(year.map(c => c.total)).toEqual([85, 50, 25])
    expect(year.reduce((a, c) => a + c.total, 0)).toBe(monthTotal(s.cards))
  })
})

describe('category data across cards', () => {
  it('covers every active card, or one card when filtered', async () => {
    const all = await cards.getCCCategoryMonthly(await accounts.activeAccountIds('CREDIT_CARD'), 2030)
    expect(all).toEqual({ Food: { 1: 70 + 25, 2: 15 }, Fuel: { 1: 50 } })
    expect(await cards.getCCCategoryMonthly('t_card2', 2030)).toEqual({ Fuel: { 1: 50 } })
  })
})

describe('card helpers', () => {
  it('resolveCardParam accepts only an active card id', () => {
    const active = ['acct_max', 't_card2']
    expect(resolveCardParam('t_card2', active)).toBe('t_card2')
    expect(resolveCardParam('t_card_old', active)).toBeUndefined()
    expect(resolveCardParam('acct_leumi', active)).toBeUndefined()
    expect(resolveCardParam(undefined, active)).toBeUndefined()
    expect(resolveCardParam('', active)).toBeUndefined()
  })

  it('cardLabel adds the last four digits when known', () => {
    expect(cardLabel({ displayName: 'Test card', cardLastFour: null })).toBe('Test card')
    expect(cardLabel({ displayName: 'Test card', cardLastFour: '0001' })).toBe('Test card (0001)')
  })
})
