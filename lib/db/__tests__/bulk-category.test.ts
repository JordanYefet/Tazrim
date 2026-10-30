import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import { parseSearchParams } from '../../search/query'

// One category on many bank rows and card charges at once. Made-up values only.
let db: TestDb
let bulk: typeof import('../bulk-category')
let prisma: typeof import('../client')['prisma']

let seq = 0
async function bank(description: string, over: Record<string, unknown> = {}) {
  const id = `b${++seq}`
  await prisma.bankTransaction.create({
    data: {
      id,
      accountId: 'acct_leumi',
      date: new Date(2030, 1, seq),
      originalDescription: description,
      description,
      debit: 100,
      credit: 0,
      balance: 1000,
      sourceFile: 'fake.xls',
      ...over,
    },
  })
  return id
}
async function card(merchant: string, over: Record<string, unknown> = {}) {
  const id = `c${++seq}`
  await prisma.creditCardTransaction.create({
    data: {
      id,
      accountId: 'acct_max',
      transactionDate: new Date(2030, 1, seq),
      billingDate: new Date(2030, 2, 2),
      originalMerchantName: merchant,
      merchantName: merchant,
      category: 'Fake Issuer Shops',
      chargedAmount: 10,
      originalAmount: 10,
      originalCurrency: 'ILS',
      cardLastFour: '',
      transactionType: 'regular',
      ...over,
    },
  })
  return id
}

const T: Record<string, string> = {}
const bankRow = (id: string) => db.query<{ category: string | null; categoryManual: number }>(`SELECT category, categoryManual FROM BankTransaction WHERE id = '${id}'`)[0]
const cardRow = (id: string) => db.query<{ categoryOverride: string | null }>(`SELECT categoryOverride FROM CreditCardTransaction WHERE id = '${id}'`)[0]

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_card2', 'CREDIT_CARD', 'fakecard', 'Test Card Two', 1900000000001);`)
  usePrismaOn(db)
  bulk = await import('../bulk-category')
  prisma = (await import('../client')).prisma
  await prisma.category.createMany({
    data: [
      { name: 'Fake Gifts', kind: 'EXPENSE' },
      { name: 'Fake Refunds', kind: 'INCOME' },
    ],
  })
  T.chequeOut = await bank('FAKE CHEQUE 1')
  T.chequeOut2 = await bank('FAKE CHEQUE 2')
  T.chequeIn = await bank('FAKE CHEQUE 3', { debit: 0, credit: 50 })
  T.chequeHidden = await bank('FAKE CHEQUE 4', { ignored: true })
  T.payment = await bank('FAKE MAX PAYMENT')
  T.shop = await card('FAKE CHEQUE SHOP')
  T.shop2 = await card('FAKE CHEQUE SHOP', { accountId: 'acct_card2' })
})

beforeEach(() => {
  db.exec(`UPDATE BankTransaction SET category = NULL, categoryManual = 0; UPDATE CreditCardTransaction SET categoryOverride = NULL;`)
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('setCardCategoryMany', () => {
  it('overrides only the listed charges of that card', async () => {
    await bulk.setCardCategoryMany({ accountId: 'acct_max', ids: [T.shop], category: 'Fake Gifts' })
    expect(cardRow(T.shop).categoryOverride).toBe('Fake Gifts')
    expect(cardRow(T.shop2).categoryOverride).toBeNull()
  })

  it('refuses another card\'s charge, no category, or a non-expense one, changing nothing', async () => {
    const many = (ids: string[], category: string | null) => bulk.setCardCategoryMany({ accountId: 'acct_max', ids, category })
    await expect(many([T.shop, T.shop2], 'Fake Gifts')).rejects.toMatchObject({ status: 404 })
    await expect(many([T.shop], null)).rejects.toMatchObject({ status: 400 })
    await expect(many([T.shop], 'Fake Refunds')).rejects.toMatchObject({ status: 400 })
    await expect(many([T.shop], 'Nope')).rejects.toMatchObject({ status: 400 })
    expect(cardRow(T.shop).categoryOverride).toBeNull()
  })
})

describe('setCategoryMany', () => {
  it('sets bank rows (as manual choices) and card charges of any card together', async () => {
    const res = await bulk.setCategoryMany({ bankIds: [T.chequeOut], cardIds: [T.shop, T.shop2], category: 'Fake Gifts' })
    expect(res).toEqual({ bankIds: [T.chequeOut], cardIds: [T.shop, T.shop2] })
    expect(bankRow(T.chequeOut)).toEqual({ category: 'Fake Gifts', categoryManual: 1 })
    expect(cardRow(T.shop2).categoryOverride).toBe('Fake Gifts')
  })

  it('all or nothing: a bad card charge leaves the bank rows alone', async () => {
    await expect(bulk.setCategoryMany({ bankIds: [T.chequeOut], cardIds: ['missing'], category: 'Fake Gifts' })).rejects.toMatchObject({ status: 404 })
    expect(bankRow(T.chequeOut)).toEqual({ category: null, categoryManual: 0 })
  })

  it('refuses an income category with card charges, and clearing them', async () => {
    await expect(bulk.setCategoryMany({ bankIds: [T.chequeIn], cardIds: [T.shop], category: 'Fake Refunds' })).rejects.toMatchObject({ status: 400 })
    await expect(bulk.setCategoryMany({ bankIds: [], cardIds: [T.shop], category: null })).rejects.toMatchObject({ status: 400 })
    expect(bankRow(T.chequeIn).category).toBeNull()
  })
})

describe('bulkTargetsFor', () => {
  it('takes every match that can have a category: no hidden rows, no card payments', async () => {
    const t = (await bulk.bulkTargetsFor(parseSearchParams({ q: 'FAKE CHEQUE', ignored: '1' })))!
    expect(t.bankIds.sort()).toEqual([T.chequeOut, T.chequeOut2, T.chequeIn].sort())
    expect(t.cardIds.sort()).toEqual([T.shop, T.shop2].sort())
    expect(t).toMatchObject({ bankOut: 2, bankIn: 1 })

    const any = (await bulk.bulkTargetsFor(parseSearchParams({ q: 'PAYMENT SHOP', match: 'any' })))!
    expect(any.bankIds).toEqual([])
    expect(any.cardIds.sort()).toEqual([T.shop, T.shop2].sort())
  })
})
