import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import { resolvePeriod } from '../../period'

// A remembered year with no data falls back to the current year (ENG-63).
// Made-up rows only: a bank row in 2030, a card charge billed in 2031.
let db: TestDb
let yearHasData: typeof import('../../period-server')['yearHasData']

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  const { prisma } = await import('../client')
  yearHasData = (await import('../../period-server')).yearHasData
  await prisma.bankTransaction.create({
    data: {
      accountId: 'acct_leumi',
      date: new Date(2030, 5, 10),
      originalDescription: 'TEST ROW',
      description: 'TEST ROW',
      debit: 10,
      credit: 0,
      balance: 100,
      sourceFile: 'fake.xls',
    },
  })
  await prisma.creditCardTransaction.create({
    data: {
      accountId: 'acct_max',
      transactionDate: new Date(2030, 11, 20),
      billingDate: new Date(2031, 0, 10),
      originalMerchantName: 'TEST SHOP',
      merchantName: 'TEST SHOP',
      category: 'Food',
      chargedAmount: 5,
      originalAmount: 5,
      originalCurrency: 'ILS',
      cardLastFour: '',
      transactionType: 'regular',
      sourceFile: 'fake.xlsx',
    },
  })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('yearHasData', () => {
  it('bank rows by date, card charges by billing month', async () => {
    expect(await yearHasData(2030)).toBe(true)
    expect(await yearHasData(2031)).toBe(true)
    expect(await yearHasData(2029)).toBe(false)
    expect(await yearHasData(2032)).toBe(false)
  })

  it('drives the remembered-year fallback', async () => {
    const now = new Date(2032, 2, 1)
    expect(await resolvePeriod({}, '2030-6', { now, yearHasData })).toEqual({ year: 2030, month: 6, source: 'cookie' })
    expect(await resolvePeriod({}, '2029-6', { now, yearHasData })).toEqual({ year: 2032, source: 'default' })
  })
})
