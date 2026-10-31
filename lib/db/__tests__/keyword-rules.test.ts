import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

// Contains-text category rules on stored rows and on import. Made-up values only.
let db: TestDb
let rules: typeof import('../keyword-rules')
let prisma: typeof import('../client')['prisma']

let seq = 0
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
      category: 'Fake Issuer Fun',
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

const cardRow = (id: string) =>
  db.query<{ categoryOverride: string | null; categoryManual: number }>(
    `SELECT categoryOverride, categoryManual FROM CreditCardTransaction WHERE id = '${id}'`
  )[0]
const bankRow = (id: string) =>
  db.query<{ category: string | null; categoryManual: number }>(`SELECT category, categoryManual FROM BankTransaction WHERE id = '${id}'`)[0]
const ruleId = (pattern: string) => db.query<{ id: string }>(`SELECT id FROM CategoryKeywordRule WHERE pattern = '${pattern}'`)[0].id

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  rules = await import('../keyword-rules')
  prisma = (await import('../client')).prisma
  await prisma.category.createMany({
    data: [
      { name: 'Fake Phone', kind: 'EXPENSE' },
      { name: 'Fake Music', kind: 'EXPENSE' },
      { name: 'Fake Exact', kind: 'EXPENSE' },
      { name: 'Fake Refunds', kind: 'INCOME' },
    ],
  })
})

beforeEach(() =>
  db.exec(`DELETE FROM CreditCardTransaction; DELETE FROM BankTransaction; DELETE FROM CategoryKeywordRule;
    DELETE FROM TransactionAlias; DELETE FROM BankCategoryRule; DELETE FROM GenericDescription;`)
)

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('saving a rule', () => {
  it('sets every matching row nobody picked by hand, in both tables, case-insensitively', async () => {
    const a = await card('ACME MUSIC P11111 TESTVILLE')
    const b = await card('acme music p22222 testville')
    const manual = await card('ACME MUSIC P33333 TESTVILLE', { categoryOverride: 'Fake Music', categoryManual: true })
    const other = await card('OTHER SHOP')
    const debit = await bank('ACME MUSIC DEBIT')
    const credit = await bank('ACME MUSIC REFUND', { debit: 0, credit: 30 })

    const res = await rules.saveKeywordRule({ pattern: '  Acme   Music ', category: 'Fake Phone' })
    expect(res.rule.pattern).toBe('Acme Music')
    expect(new Set(res.cardIds)).toEqual(new Set([a, b]))
    expect(res.bankIds).toEqual([debit])
    expect(cardRow(a)).toEqual({ categoryOverride: 'Fake Phone', categoryManual: 0 })
    expect(cardRow(b).categoryOverride).toBe('Fake Phone')
    // A pick by hand stays
    expect(cardRow(manual)).toEqual({ categoryOverride: 'Fake Music', categoryManual: 1 })
    expect(cardRow(other).categoryOverride).toBeNull()
    // An expense category never reaches credits
    expect(bankRow(credit).category).toBeNull()
  })

  it("leaves rows with an exact rule to it", async () => {
    await prisma.transactionAlias.create({ data: { provider: 'max', originalName: 'ACME MUSIC P1', displayName: 'Acme', categoryOverride: 'Fake Exact' } })
    await prisma.bankCategoryRule.create({ data: { provider: 'leumi', originalDescription: 'ACME MUSIC DEBIT', direction: 'OUT', category: 'Fake Exact' } })
    const ruled = await card('ACME MUSIC P1', { categoryOverride: 'Fake Exact' })
    const ruledBank = await bank('ACME MUSIC DEBIT', { category: 'Fake Exact' })
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone' })
    expect(cardRow(ruled).categoryOverride).toBe('Fake Exact')
    expect(bankRow(ruledBank).category).toBe('Fake Exact')
  })

  it('never touches card payments or generic descriptions', async () => {
    await prisma.genericDescription.create({ data: { description: 'ACME CHEQUE' } })
    const payment = await bank('ACME מקס איט פיננסים')
    const cheque = await bank('ACME CHEQUE')
    const res = await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone' })
    expect(res.bankIds).toEqual([])
    expect(bankRow(payment).category).toBeNull()
    expect(bankRow(cheque).category).toBeNull()
  })

  it('gives credits an income rule', async () => {
    const debit = await bank('ACME REFUND')
    const credit = await bank('ACME REFUND', { debit: 0, credit: 30 })
    const c = await card('ACME REFUND')
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Refunds' })
    expect(bankRow(credit).category).toBe('Fake Refunds')
    expect(bankRow(debit).category).toBeNull()
    expect(cardRow(c).categoryOverride).toBeNull()
  })

  it('lets the longest pattern win', async () => {
    const c = await card('ACME MUSIC P1')
    const d = await card('ACME SHOP')
    await rules.saveKeywordRule({ pattern: 'ACME MUSIC', category: 'Fake Phone' })
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Music' })
    expect(cardRow(c).categoryOverride).toBe('Fake Phone')
    expect(cardRow(d).categoryOverride).toBe('Fake Music')
  })

  it('updates the rule with the same text in any case instead of adding one', async () => {
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone' })
    await rules.saveKeywordRule({ pattern: 'acme', category: 'Fake Music' })
    expect(db.query(`SELECT pattern, category FROM CategoryKeywordRule`)).toEqual([{ pattern: 'acme', category: 'Fake Music' }])
  })

  it('refuses a pattern that is too short, or a category that does not exist', async () => {
    await expect(rules.saveKeywordRule({ pattern: 'A', category: 'Fake Phone' })).rejects.toThrow()
    await expect(rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Missing' })).rejects.toThrow()
  })

  it('makes the row it was saved from follow the rule, after checking the kind', async () => {
    const c = await card('ACME MUSIC P1', { categoryOverride: 'Fake Music', categoryManual: true })
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone', fromRow: { source: 'card', id: c } })
    expect(cardRow(c)).toEqual({ categoryOverride: 'Fake Phone', categoryManual: 0 })
    await expect(
      rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Refunds', fromRow: { source: 'card', id: c } })
    ).rejects.toThrow()
  })
})

describe('editing and deleting a rule', () => {
  it('recomputes the rows the old and the new text reach', async () => {
    const music = await card('ACME MUSIC P1')
    const radio = await card('ACME RADIO P2')
    const { rule } = await rules.saveKeywordRule({ pattern: 'ACME MUSIC', category: 'Fake Phone' })
    await rules.saveKeywordRule({ id: rule.id, pattern: 'ACME RADIO', category: 'Fake Phone' })
    expect(cardRow(music).categoryOverride).toBeNull()
    expect(cardRow(radio).categoryOverride).toBe('Fake Phone')
  })

  it('falls back to another contains rule, an exact rule, or none', async () => {
    await prisma.transactionAlias.create({ data: { provider: 'max', originalName: 'ACME EXACT', displayName: 'Acme', categoryOverride: 'Fake Exact' } })
    const exact = await card('ACME EXACT', { categoryOverride: 'Fake Exact' })
    const other = await card('ACME MUSIC P1')
    const none = await card('ACME P2')
    const manual = await card('ACME P3', { categoryOverride: 'Fake Music', categoryManual: true })
    const debit = await bank('ACME DEBIT')
    await rules.saveKeywordRule({ pattern: 'MUSIC', category: 'Fake Music' })
    await rules.saveKeywordRule({ pattern: 'ACME MUSIC', category: 'Fake Phone' })
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone' })
    expect(cardRow(other).categoryOverride).toBe('Fake Phone')

    const res = await rules.deleteKeywordRules([ruleId('ACME MUSIC'), ruleId('ACME')])
    expect(cardRow(exact).categoryOverride).toBe('Fake Exact')
    expect(cardRow(other).categoryOverride).toBe('Fake Music')
    // No rule left: the issuer's category shows again
    expect(cardRow(none).categoryOverride).toBeNull()
    expect(cardRow(manual).categoryOverride).toBe('Fake Music')
    expect(bankRow(debit).category).toBeNull()
    expect(new Set(res.cardIds)).toEqual(new Set([other, none]))
    expect(res.bankIds).toEqual([debit])
  })
})

describe('preview', () => {
  it('counts the rows of the kind the text reaches, and those the rule would set', async () => {
    await card('ACME P1')
    await card('ACME P2', { categoryOverride: 'Fake Music', categoryManual: true })
    await bank('ACME DEBIT')
    await bank('ACME CREDIT', { debit: 0, credit: 5 })
    await bank('ACME מקס איט')
    expect(await rules.previewKeywordRule('acme', 'EXPENSE')).toEqual({ matches: 3, applies: 2 })
    expect(await rules.previewKeywordRule('acme', 'INCOME')).toEqual({ matches: 1, applies: 1 })
    expect(await rules.previewKeywordRule('a', 'EXPENSE')).toEqual({ matches: 0, applies: 0 })
  })
})

describe('when an exact rule goes', () => {
  it('a bank row falls back to the contains rule', async () => {
    const cats = await import('../bank-categories')
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone' })
    const id = await bank('ACME UTILITY')
    await cats.setBankCategory({ id, category: 'Fake Exact', scope: 'rule' })
    expect(bankRow(id).category).toBe('Fake Exact')
    await cats.removeBankCategoryRule({ provider: 'leumi', originalDescription: 'ACME UTILITY', direction: 'OUT' })
    expect(bankRow(id).category).toBe('Fake Phone')
  })

  it("a card charge falls back to the contains rule when the merchant rule's category is removed", async () => {
    const aliases = await import('../aliases')
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Phone' })
    const id = await card('ACME MUSIC P1')
    const manual = await card('ACME MUSIC P1', { categoryOverride: 'Fake Music', categoryManual: true })
    await aliases.upsertAliasAndBulkUpdate({ provider: 'max', originalName: 'ACME MUSIC P1', displayName: 'Acme', categoryOverride: 'Fake Exact' })
    expect(cardRow(id).categoryOverride).toBe('Fake Exact')
    expect(cardRow(manual).categoryOverride).toBe('Fake Music')
    await aliases.upsertAliasAndBulkUpdate({ provider: 'max', originalName: 'ACME MUSIC P1', displayName: 'Acme', categoryOverride: null })
    expect(cardRow(id).categoryOverride).toBe('Fake Phone')
    expect(cardRow(manual).categoryOverride).toBe('Fake Music')
  })
})

describe('on import', () => {
  it('a new card charge takes the contains rule unless a merchant rule has a category', async () => {
    const cards = await import('../cards')
    await prisma.transactionAlias.create({ data: { provider: 'max', originalName: 'ACME EXACT', displayName: 'Acme', categoryOverride: 'Fake Exact' } })
    await rules.saveKeywordRule({ pattern: 'acme', category: 'Fake Phone' })
    const tx = (originalMerchantName: string, day: number): ParsedCCTransaction => ({
      transactionDate: new Date(2030, 3, day),
      billingDate: new Date(2030, 4, 2),
      originalMerchantName,
      merchantName: originalMerchantName,
      category: 'Fake Issuer Fun',
      chargedAmount: 9,
      originalAmount: 9,
      originalCurrency: 'ILS',
      chargedCurrency: '₪',
      cardLastFour: '0000',
      transactionType: 'regular',
      notes: '',
      cardProvider: 'MAX',
    })
    await cards.upsertCCTransactions([tx('ACME MUSIC P9', 1), tx('ACME EXACT', 2), tx('OTHER', 3)], 'fake.xlsx', 'acct_max')
    expect(
      db.query(`SELECT originalMerchantName, categoryOverride, categoryManual FROM CreditCardTransaction ORDER BY originalMerchantName`)
    ).toEqual([
      { originalMerchantName: 'ACME EXACT', categoryOverride: 'Fake Exact', categoryManual: 0 },
      { originalMerchantName: 'ACME MUSIC P9', categoryOverride: 'Fake Phone', categoryManual: 0 },
      { originalMerchantName: 'OTHER', categoryOverride: null, categoryManual: 0 },
    ])
  })

  it('a new bank row takes the rule of its direction; card payments and generic descriptions none', async () => {
    const bankDb = await import('../bank')
    await prisma.genericDescription.create({ data: { description: 'ACME CHEQUE' } })
    await rules.saveKeywordRule({ pattern: 'acme', category: 'Fake Phone' })
    await rules.saveKeywordRule({ pattern: 'acme refund', category: 'Fake Refunds' })
    const row = (originalDescription: string, day: number, debit: number, credit: number): ParsedBankTransaction => ({
      date: new Date(2030, 3, day),
      originalDescription,
      description: originalDescription,
      debit,
      credit,
      balance: 1000,
      note: '',
      sourceFile: 'fake.xlsx',
    })
    await bankDb.upsertBankTransactions(
      [row('ACME DEBIT', 1, 10, 0), row('ACME REFUND', 2, 0, 10), row('ACME CHEQUE', 3, 10, 0), row('ACME מקס איט', 4, 10, 0)],
      'acct_leumi'
    )
    expect(db.query(`SELECT originalDescription, category FROM BankTransaction ORDER BY date`)).toEqual([
      { originalDescription: 'ACME DEBIT', category: 'Fake Phone' },
      { originalDescription: 'ACME REFUND', category: 'Fake Refunds' },
      { originalDescription: 'ACME CHEQUE', category: null },
      { originalDescription: 'ACME מקס איט', category: null },
    ])
  })
})

describe('categories', () => {
  it('a rename carries the rule; a delete removes it and reverts its rows', async () => {
    const categories = await import('../categories')
    const extra = await prisma.category.create({ data: { name: 'Fake Temp', kind: 'EXPENSE' } })
    const c = await card('ACME P1')
    await rules.saveKeywordRule({ pattern: 'ACME', category: 'Fake Temp' })
    await categories.renameCategory(extra.id, 'Fake Temp 2')
    expect(db.query(`SELECT category FROM CategoryKeywordRule`)).toEqual([{ category: 'Fake Temp 2' }])
    expect(cardRow(c).categoryOverride).toBe('Fake Temp 2')
    await categories.deleteCategory(extra.id)
    expect(db.query(`SELECT * FROM CategoryKeywordRule`)).toEqual([])
    expect(cardRow(c).categoryOverride).toBeNull()
  })
})
