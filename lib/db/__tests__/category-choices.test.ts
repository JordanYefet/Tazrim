import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

// What a category can be filled from (the categories page): card merchants, bank
// descriptions, and a bank rule added from there. Made-up values only.
let db: TestDb
let choices: typeof import('../category-choices')
let cats: typeof import('../bank-categories')
let client: typeof import('../client')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 10),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'FAKE SHOP LTD',
  merchantName: 'FAKE SHOP LTD',
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
const row = (over: Partial<ParsedBankTransaction>): ParsedBankTransaction => ({
  date: new Date(2030, 1, 10),
  originalDescription: 'FAKE WATER',
  description: 'FAKE WATER',
  debit: 100,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake.xlsx',
  ...over,
})

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  choices = await import('../category-choices')
  cats = await import('../bank-categories')
  client = await import('../client')
  const cards = await import('../cards')
  const bank = await import('../bank')
  const categories = await import('../categories')
  await categories.createCategory('Fake Home', 'EXPENSE')
  await categories.createCategory('Fake Salary', 'INCOME')

  await cards.upsertCCTransactions(
    [cc({}), cc({ transactionDate: new Date(2030, 0, 11) }), cc({ originalMerchantName: 'FAKE FUEL', merchantName: 'FAKE FUEL' })],
    'max-choices.xlsx',
    'acct_max'
  )
  await client.prisma.transactionAlias.create({ data: { provider: 'max', originalName: 'FAKE SHOP LTD', displayName: 'FAKE SHOP' } })
  await bank.upsertBankTransactions(
    [
      row({}),
      row({ date: new Date(2030, 2, 10) }),
      row({ originalDescription: 'FAKE EMPLOYER', description: 'FAKE EMPLOYER', debit: 0, credit: 5000 }),
      // The card payment and a generic description are never choices
      row({ originalDescription: 'FAKE MAX PAYMENT', description: 'FAKE MAX PAYMENT', debit: 500 }),
      row({ originalDescription: 'שיק', description: 'שיק', debit: 300 }),
    ],
    'acct_leumi'
  )
  // A row chosen by hand keeps its category when a rule comes
  await client.prisma.bankTransaction.updateMany({
    where: { originalDescription: 'FAKE WATER', date: new Date(2030, 2, 10) },
    data: { category: 'Fake Home', categoryManual: true },
  })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('listCardMerchants', () => {
  it('lists each merchant once per provider, with its display name and charge count', async () => {
    expect(await choices.listCardMerchants()).toEqual([
      { provider: 'max', originalName: 'FAKE FUEL', displayName: 'FAKE FUEL', count: 1 },
      { provider: 'max', originalName: 'FAKE SHOP LTD', displayName: 'FAKE SHOP', count: 2 },
    ])
  })
})

describe('listBankDescriptions', () => {
  it('lists the descriptions of one direction, without the card payment or generic ones', async () => {
    expect(await choices.listBankDescriptions('OUT')).toEqual([
      { provider: 'leumi', originalDescription: 'FAKE WATER', count: 2 },
    ])
    expect(await choices.listBankDescriptions('IN')).toEqual([
      { provider: 'leumi', originalDescription: 'FAKE EMPLOYER', count: 1 },
    ])
  })
})

describe('setBankDescriptionRule', () => {
  it('adds the rule and gives its non-manual rows the category', async () => {
    const { updatedIds } = await cats.setBankDescriptionRule({ provider: 'leumi', originalDescription: 'FAKE WATER', direction: 'OUT', category: 'Fake Home' })
    expect(updatedIds).toHaveLength(1)
    expect((await cats.listBankCategoryRules()).map(r => [r.originalDescription, r.direction, r.category])).toEqual([['FAKE WATER', 'OUT', 'Fake Home']])
    const rows = await client.prisma.bankTransaction.findMany({ where: { originalDescription: 'FAKE WATER' } })
    expect(rows.map(r => [r.category, r.categoryManual]).sort()).toEqual([['Fake Home', false], ['Fake Home', true]])
  })

  it('refuses a generic description, an unknown category and one of the wrong kind', async () => {
    await expect(cats.setBankDescriptionRule({ provider: 'leumi', originalDescription: 'שיק', direction: 'OUT', category: 'Fake Home' })).rejects.toMatchObject({ status: 400 })
    await expect(cats.setBankDescriptionRule({ provider: 'leumi', originalDescription: 'FAKE WATER', direction: 'OUT', category: 'Nope' })).rejects.toMatchObject({ status: 400 })
    await expect(cats.setBankDescriptionRule({ provider: 'leumi', originalDescription: 'FAKE EMPLOYER', direction: 'IN', category: 'Fake Home' })).rejects.toMatchObject({ status: 400 })
  })
})
