import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import { parseSearchParams } from '../../search/query'

// The issuer's / bank's transaction id is searchable. Made-up rows only.
let db: TestDb
let search: typeof import('../search')

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  search = await import('../search')
  const { prisma } = await import('../client')
  await prisma.creditCardTransaction.create({
    data: {
      id: 'c_voucher',
      accountId: 'acct_max',
      transactionDate: new Date('2030-08-05T10:00:00'),
      billingDate: new Date('2030-08-10T10:00:00'),
      originalMerchantName: 'תחנת דלק בדויה',
      merchantName: 'תחנת דלק בדויה',
      category: '',
      chargedAmount: 250,
      originalAmount: 250,
      originalCurrency: '₪',
      cardLastFour: '0000',
      transactionType: '',
      reference: '100478',
    },
  })
  await prisma.bankTransaction.create({
    data: {
      id: 'b_ref',
      accountId: 'acct_leumi',
      date: new Date('2030-08-06T10:00:00'),
      originalDescription: 'העברה בדויה',
      description: 'העברה בדויה',
      debit: 90,
      credit: 0,
      balance: 1000,
      reference: '55512',
      sourceFile: 'fake.xls',
    },
  })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const run = (q: string) => search.searchTransactions(parseSearchParams({ q }))

describe('searching by reference', () => {
  it('finds a card row by its voucher number and returns the number', async () => {
    const page = await run('100478')
    expect(page.results.map(r => r.id)).toEqual(['c_voucher'])
    expect(page.results[0].reference).toBe('100478')
  })

  it('finds a bank row by its אסמכתא, also by part of it', async () => {
    expect((await run('55512')).results.map(r => r.id)).toEqual(['b_ref'])
    expect((await run('5551')).results.map(r => r.id)).toEqual(['b_ref'])
  })

  it('returns the reference with a row found by its name too', async () => {
    const page = await run('העברה')
    expect(page.results[0]).toMatchObject({ id: 'b_ref', reference: '55512' })
    expect((await run('דלק')).results[0].reference).toBe('100478')
  })
})
