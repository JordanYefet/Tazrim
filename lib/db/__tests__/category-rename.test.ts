import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

// Renaming a category renames it everywhere its name is stored. Made-up values only.
let db: TestDb
let cats: typeof import('../categories')
let cards: typeof import('../cards')
let bank: typeof import('../bank')
let client: typeof import('../client')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 10),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'FAKE SCHOOL',
  merchantName: 'FAKE SCHOOL',
  category: 'Fake Kids',
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
  originalDescription: 'FAKE KINDERGARTEN',
  description: 'FAKE KINDERGARTEN',
  debit: 100,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake.xlsx',
  ...over,
})

let kidsId: string

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  cats = await import('../categories')
  cards = await import('../cards')
  bank = await import('../bank')
  client = await import('../client')
  const prisma = client.prisma

  kidsId = (await cats.createCategory('Fake Kids', 'EXPENSE')).id
  await cats.createCategory('Fake Other', 'EXPENSE')

  // A card row whose issuer category is unmapped (its own name is the category), and one mapped to it
  await cards.upsertCCTransactions([cc({}), cc({ originalMerchantName: 'FAKE TOYS', merchantName: 'FAKE TOYS', category: 'FAKE ISSUER KIDS' })], 'max-rename.xlsx', 'acct_max')
  await prisma.categoryMapping.create({ data: { provider: 'max', sourceCategory: 'FAKE ISSUER KIDS', category: 'Fake Kids' } })
  await prisma.creditCardTransaction.updateMany({ where: { sourceCategory: 'FAKE ISSUER KIDS' }, data: { category: 'Fake Kids' } })
  // A merchant rule and a hand-set override on a card row
  await prisma.transactionAlias.create({ data: { provider: 'max', originalName: 'FAKE SCHOOL', displayName: 'FAKE SCHOOL', categoryOverride: 'Fake Kids' } })
  await prisma.creditCardTransaction.updateMany({ where: { originalMerchantName: 'FAKE SCHOOL' }, data: { categoryOverride: 'Fake Kids' } })
  // Bank: a row and a rule
  await bank.upsertBankTransactions([row({}), row({ originalDescription: 'FAKE OTHER', description: 'FAKE OTHER' })], 'acct_leumi')
  await prisma.bankTransaction.updateMany({ where: { originalDescription: 'FAKE KINDERGARTEN' }, data: { category: 'Fake Kids' } })
  await prisma.bankTransaction.updateMany({ where: { originalDescription: 'FAKE OTHER' }, data: { category: 'Fake Other' } })
  await prisma.bankCategoryRule.create({ data: { provider: 'leumi', originalDescription: 'FAKE KINDERGARTEN', direction: 'OUT', category: 'Fake Kids' } })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('renameCategory', () => {
  it('renames it on rows, overrides, merchant rules, bank rules and issuer mappings', async () => {
    await cats.renameCategory(kidsId, 'Fake Kindergartens')
    const prisma = client.prisma
    const names = (rows: { category: string | null }[]) => [...new Set(rows.map(r => r.category))].sort()

    const all = (await prisma.category.findMany()).map(c => c.name)
    expect(all).toContain('Fake Kindergartens')
    expect(all).not.toContain('Fake Kids')
    expect(names(await prisma.creditCardTransaction.findMany())).toEqual(['Fake Kindergartens'])
    expect((await prisma.creditCardTransaction.findFirst({ where: { originalMerchantName: 'FAKE SCHOOL' } }))?.categoryOverride).toBe('Fake Kindergartens')
    expect((await prisma.transactionAlias.findFirst())?.categoryOverride).toBe('Fake Kindergartens')
    expect((await prisma.bankCategoryRule.findFirst())?.category).toBe('Fake Kindergartens')
    // Other categories are untouched
    expect(names(await prisma.bankTransaction.findMany())).toEqual(['Fake Kindergartens', 'Fake Other'])
  })

  it('maps the issuer category that carried the old name, so later files arrive under the new one', async () => {
    const mappings = await client.prisma.categoryMapping.findMany({ orderBy: { sourceCategory: 'asc' } })
    expect(mappings.map(m => [m.provider, m.sourceCategory, m.category])).toEqual([
      ['max', 'FAKE ISSUER KIDS', 'Fake Kindergartens'],
      ['max', 'Fake Kids', 'Fake Kindergartens'],
    ])
    await cards.upsertCCTransactions([cc({ transactionDate: new Date(2030, 2, 10), billingDate: new Date(2030, 3, 2), originalMerchantName: 'FAKE BOOKS', merchantName: 'FAKE BOOKS' })], 'max-rename-2.xlsx', 'acct_max')
    expect((await client.prisma.creditCardTransaction.findFirst({ where: { originalMerchantName: 'FAKE BOOKS' } }))?.category).toBe('Fake Kindergartens')
  })
})
