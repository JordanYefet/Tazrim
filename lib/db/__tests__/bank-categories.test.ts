import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction } from '../../parsers/types'

let db: TestDb
let bank: typeof import('../bank')
let cats: typeof import('../bank-categories')

// Made-up rows only. acct_leumi is seeded by the migrations; a second Leumi
// account and another bank's account sit next to it.
const row = (over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, 1, 10),
  originalDescription: 'FAKE TRANSFER',
  description: 'FAKE TRANSFER',
  debit: 0,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake.xlsx',
  ...over,
})

const categoryOf = (id: string) =>
  db.query<{ category: string | null; categoryManual: number }>(
    `SELECT category, categoryManual FROM "BankTransaction" WHERE id = '${id}'`
  )[0]

const idOf = (accountId: string, description: string, day: number) =>
  db.query<{ id: string }>(
    `SELECT id FROM "BankTransaction" WHERE accountId = '${accountId}' AND originalDescription = '${description}'
     AND date = ${new Date(2030, 1, day).getTime()}`
  )[0].id

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_fake_leumi2', 'BANK', 'leumi', 'Second fake bank', 1900000000000),
  ('acct_fake_other', 'BANK', 'otherbank', 'Other fake bank', 1900000000000);
INSERT INTO "Category" ("id","name","kind") VALUES
  ('k1','Fake Rent','EXPENSE'), ('k2','Fake Salary','INCOME'), ('k3','Fake Rent In','INCOME'), ('k4','Fake Food','EXPENSE');
`)
  usePrismaOn(db)
  bank = await import('../bank')
  cats = await import('../bank-categories')
})

beforeEach(() => db.exec(`DELETE FROM "BankTransaction"; DELETE FROM "BankCategoryRule";`))

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

/** Outgoing and incoming transfers with the same text, and the card payment, in two accounts of one provider and one other */
async function seed() {
  const rows = [
    row({ date: new Date(2030, 1, 1), debit: 300 }),
    row({ date: new Date(2030, 1, 2), credit: 900 }),
    row({ date: new Date(2030, 1, 3), originalDescription: 'FAKE MAX PAYMENT', description: 'FAKE MAX PAYMENT', debit: 500 }),
  ]
  await bank.upsertBankTransactions(rows, 'acct_leumi')
  await bank.upsertBankTransactions([row({ date: new Date(2030, 1, 4), debit: 310 })], 'acct_fake_leumi2')
  await bank.upsertBankTransactions([row({ date: new Date(2030, 1, 5), debit: 320 })], 'acct_fake_other')
}

describe('setBankCategory', () => {
  it("'row' sets only that row, as a manual choice", async () => {
    await seed()
    const out = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    expect(await cats.setBankCategory({ id: out, category: 'Fake Rent', scope: 'row' })).toEqual({ updatedIds: [out] })
    expect(categoryOf(out)).toEqual({ category: 'Fake Rent', categoryManual: 1 })
    expect(categoryOf(idOf('acct_fake_leumi2', 'FAKE TRANSFER', 4)).category).toBeNull()
  })

  it("'rule' covers the description in that direction at every account of the provider, except manual rows", async () => {
    await seed()
    await bank.upsertBankTransactions([row({ date: new Date(2030, 1, 6), debit: 330 })], 'acct_leumi')
    const manual = idOf('acct_leumi', 'FAKE TRANSFER', 6)
    await cats.setBankCategory({ id: manual, category: 'Fake Food', scope: 'row' })

    const out = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    const res = await cats.setBankCategory({ id: out, category: 'Fake Rent', scope: 'rule' })
    expect(res.updatedIds.sort()).toEqual([out, idOf('acct_fake_leumi2', 'FAKE TRANSFER', 4)].sort())

    expect(categoryOf(out)).toEqual({ category: 'Fake Rent', categoryManual: 0 })
    expect(categoryOf(idOf('acct_fake_leumi2', 'FAKE TRANSFER', 4)).category).toBe('Fake Rent')
    // The hand-set row, the incoming transfer and the other provider stay as they were
    expect(categoryOf(manual).category).toBe('Fake Food')
    expect(categoryOf(idOf('acct_leumi', 'FAKE TRANSFER', 2)).category).toBeNull()
    expect(categoryOf(idOf('acct_fake_other', 'FAKE TRANSFER', 5)).category).toBeNull()
  })

  it('a rule applies to later imports, in its direction only', async () => {
    await seed()
    await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE TRANSFER', 2), category: 'Fake Rent In', scope: 'rule' })
    await bank.upsertBankTransactions(
      [row({ date: new Date(2030, 1, 20), credit: 900 }), row({ date: new Date(2030, 1, 21), debit: 50 })],
      'acct_fake_leumi2'
    )
    expect(categoryOf(idOf('acct_fake_leumi2', 'FAKE TRANSFER', 20))).toEqual({ category: 'Fake Rent In', categoryManual: 0 })
    expect(categoryOf(idOf('acct_fake_leumi2', 'FAKE TRANSFER', 21)).category).toBeNull()
  })

  it('clearing with a rule removes the rule and the categories it set', async () => {
    await seed()
    const out = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    await cats.setBankCategory({ id: out, category: 'Fake Rent', scope: 'rule' })
    await cats.setBankCategory({ id: out, category: null, scope: 'rule' })
    expect(db.query(`SELECT COUNT(*) AS n FROM "BankCategoryRule"`)).toEqual([{ n: 0 }])
    expect(categoryOf(idOf('acct_fake_leumi2', 'FAKE TRANSFER', 4)).category).toBeNull()
  })

  it('refuses a category of the wrong kind, an unknown one, and the card payment row', async () => {
    await seed()
    const out = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    await expect(cats.setBankCategory({ id: out, category: 'Fake Salary', scope: 'row' })).rejects.toMatchObject({ status: 400 })
    await expect(cats.setBankCategory({ id: out, category: 'Nope', scope: 'row' })).rejects.toMatchObject({ status: 400 })
    const payment = idOf('acct_leumi', 'FAKE MAX PAYMENT', 3)
    await expect(cats.setBankCategory({ id: payment, category: 'Fake Rent', scope: 'row' })).rejects.toMatchObject({ status: 400 })
    await expect(cats.setBankCategory({ id: 'missing', category: null, scope: 'row' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('setBankCategoryMany', () => {
  it('sets every given row as a manual choice, and only those', async () => {
    await seed()
    const a = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    const b = idOf('acct_fake_leumi2', 'FAKE TRANSFER', 4)
    const result = await cats.setBankCategoryMany({ ids: [a, b], category: 'Fake Rent' })
    expect([...result.updatedIds].sort()).toEqual([a, b].sort())
    expect(categoryOf(a)).toEqual({ category: 'Fake Rent', categoryManual: 1 })
    expect(categoryOf(b)).toEqual({ category: 'Fake Rent', categoryManual: 1 })
    expect(categoryOf(idOf('acct_fake_other', 'FAKE TRANSFER', 5)).category).toBeNull()
  })

  it('null clears the rows, still as a manual choice', async () => {
    await seed()
    const a = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    const b = idOf('acct_fake_other', 'FAKE TRANSFER', 5)
    await cats.setBankCategoryMany({ ids: [a, b], category: 'Fake Food' })
    await cats.setBankCategoryMany({ ids: [a, b], category: null })
    expect(categoryOf(a)).toEqual({ category: null, categoryManual: 1 })
    expect(categoryOf(b)).toEqual({ category: null, categoryManual: 1 })
  })

  it('refuses a card payment row, an unknown or wrong-kind category, or a missing row, changing nothing', async () => {
    await seed()
    const a = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    const payment = idOf('acct_leumi', 'FAKE MAX PAYMENT', 3)
    const many = (ids: string[], category: string | null) => cats.setBankCategoryMany({ ids, category })
    await expect(many([a, payment], 'Fake Rent')).rejects.toMatchObject({ status: 400 })
    await expect(many([a], 'Nope')).rejects.toMatchObject({ status: 400 })
    await expect(many([a], 'Fake Salary')).rejects.toMatchObject({ status: 400 })
    await expect(many([a, 'missing'], 'Fake Rent')).rejects.toMatchObject({ status: 404 })
    expect(categoryOf(a)).toEqual({ category: null, categoryManual: 0 })
    expect(categoryOf(payment).category).toBeNull()
  })

  it('a mixed selection fails when the category fits only one direction', async () => {
    await seed()
    const out = idOf('acct_leumi', 'FAKE TRANSFER', 1)
    const inc = idOf('acct_leumi', 'FAKE TRANSFER', 2)
    await expect(cats.setBankCategoryMany({ ids: [out, inc], category: 'Fake Rent' })).rejects.toMatchObject({ status: 400 })
    await expect(cats.setBankCategoryMany({ ids: [out, inc], category: 'Fake Rent In' })).rejects.toMatchObject({ status: 400 })
    expect(categoryOf(out).categoryManual).toBe(0)
    expect(categoryOf(inc).categoryManual).toBe(0)
    // Clearing has no kind, so it fits both directions
    await cats.setBankCategoryMany({ ids: [out, inc], category: null })
    expect(categoryOf(inc)).toEqual({ category: null, categoryManual: 1 })
  })
})

describe('bank category totals', () => {
  it('buckets the card payment and uncategorized rows, or leaves the card payment out', async () => {
    await seed()
    await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE TRANSFER', 1), category: 'Fake Rent', scope: 'row' })
    await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE TRANSFER', 2), category: 'Fake Salary', scope: 'row' })
    const ids = ['acct_leumi', 'acct_fake_leumi2']

    expect(await cats.getBankCategoryMonthly(ids, 2030, 'OUT')).toEqual({
      'Fake Rent': { 2: 300 },
      'תשלום כרטיס אשראי': { 2: 500 },
      'ללא קטגוריה': { 2: 310 },
    })
    expect(await cats.getBankCategoryMonthly(ids, 2030, 'OUT', { cardPayments: 'exclude' })).toEqual({
      'Fake Rent': { 2: 300 },
      'ללא קטגוריה': { 2: 310 },
    })
    expect(await cats.getBankCategoryMonthly(ids, 2030, 'IN')).toEqual({ 'Fake Salary': { 2: 900 } })
    expect(await cats.getBankCategoryStats('acct_leumi', 2030, 2, 'OUT')).toEqual({
      'Fake Rent': { total: 300, count: 1 },
      'תשלום כרטיס אשראי': { total: 500, count: 1 },
    })
    expect(await cats.getBankCategoryStats('acct_leumi', 2030, 3, 'OUT')).toEqual({})
  })

  it('getBankTransactions filters by a category or a bucket, then pages', async () => {
    await seed()
    await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE TRANSFER', 1), category: 'Fake Rent', scope: 'row' })
    const of = async (category: string, extra: { take?: number; skip?: number } = {}) =>
      (await bank.getBankTransactions({ accountId: 'acct_leumi', year: 2030, category, ...extra })).map(r => r.date.getDate())

    expect(await of('Fake Rent')).toEqual([1])
    expect(await of('תשלום כרטיס אשראי')).toEqual([3])
    expect(await of('ללא קטגוריה')).toEqual([2])
    expect(await of('ללא קטגוריה', { skip: 1, take: 1 })).toEqual([])
  })

  it("the balance chart's points are every row of the period, ignored ones too, newest first", async () => {
    await seed()
    db.exec(`UPDATE "BankTransaction" SET ignored = 1 WHERE accountId = 'acct_leumi' AND credit > 0`)
    const points = await bank.getBankBalancePoints('acct_leumi', 2030, 2)
    expect(points.map(p => new Date(p.date).getDate())).toEqual([3, 2, 1])
    expect(await bank.getBankBalancePoints('acct_leumi', 2030, 3)).toEqual([])
  })

  it('getBankTransactions keeps only income or only expenses', async () => {
    await seed()
    const days = async (direction: 'IN' | 'OUT') =>
      (await bank.getBankTransactions({ accountId: 'acct_leumi', year: 2030, direction })).map(r => r.date.getDate()).sort()
    expect(await days('IN')).toEqual([2])
    expect(await days('OUT')).toEqual([1, 3])
  })
})
