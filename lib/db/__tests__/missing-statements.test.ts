import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// Made-up descriptions, amounts and dates only.
let db: TestDb
let missing: typeof import('../missing-statements')
let prisma: typeof import('../client')['prisma']

let seq = 0
const nextId = (p: string) => `${p}${String(++seq).padStart(3, '0')}`

async function bank(date: string, description: string, debit = 100) {
  await prisma.bankTransaction.create({
    data: {
      id: nextId('b'),
      accountId: 'acct_leumi',
      date: new Date(`${date}T00:00:00`),
      originalDescription: description,
      description,
      debit,
      credit: 0,
      balance: 1000,
      sourceFile: 'fake.xls',
    },
  })
}

async function card(billing: string, accountId = 'acct_max', ignored = false) {
  await prisma.creditCardTransaction.create({
    data: {
      id: nextId('c'),
      accountId,
      transactionDate: new Date(`${billing}T00:00:00`),
      billingDate: new Date(`${billing}T00:00:00`),
      originalMerchantName: 'Fake Shop',
      merchantName: 'Fake Shop',
      category: 'שונות',
      chargedAmount: 10,
      originalAmount: 10,
      originalCurrency: 'ILS',
      cardLastFour: '',
      transactionType: 'regular',
      ignored,
    },
  })
}

/** Ordinary rows plus the card payment on the 2nd, January to June 2030 */
async function bankHalfYear() {
  for (const m of ['01', '02', '03', '04', '05', '06']) {
    await bank(`2030-${m}-02`, 'מקס איט בדיקה')
    await bank(`2030-${m}-15`, 'Fake Grocer')
  }
}

const NOW = new Date('2030-08-20T12:00:00')

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  missing = await import('../missing-statements')
  prisma = (await import('../client')).prisma
})

beforeEach(async () => {
  await prisma.bankTransaction.deleteMany()
  await prisma.creditCardTransaction.deleteMany()
  await prisma.account.updateMany({ data: { archived: false } })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('getMissingStatements', () => {
  it('flags card months the bank paid for but no statement covers', async () => {
    await bankHalfYear()
    for (const m of ['01', '02', '04']) await card(`2030-${m}-02`)
    const res = await missing.getMissingStatements(NOW)
    expect(res.map(r => [r.accountId, r.months])).toEqual([
      ['acct_leumi', []],
      ['acct_max', ['2030-03', '2030-05', '2030-06']],
    ])
    expect(missing.formatMonthRanges(res[1].months)).toBe('מרץ 2030, מאי–יוני 2030')
  })

  it('does not flag months before the first billed month, nor a card with no rows', async () => {
    await bankHalfYear()
    expect(await missing.getAccountsMissingStatements(NOW)).toEqual([])
    await card('2030-04-02')
    const res = await missing.getAccountsMissingStatements(NOW)
    expect(res.map(r => [r.accountId, r.months])).toEqual([['acct_max', ['2030-05', '2030-06']]])
  })

  it('stops flagging once the statement is uploaded (ignored rows count)', async () => {
    await bankHalfYear()
    for (const m of ['01', '02', '03', '04', '05']) await card(`2030-${m}-02`)
    await card('2030-06-02', 'acct_max', true)
    expect(await missing.getAccountsMissingStatements(NOW)).toEqual([])
  })

  it('flags a bank gap and skips archived accounts', async () => {
    await bank('2030-01-05', 'Fake Grocer')
    await bank('2030-04-05', 'Fake Grocer')
    await prisma.account.update({ where: { id: 'acct_max' }, data: { archived: true } })
    const res = await missing.getAccountsMissingStatements(NOW)
    expect(res.map(r => [r.accountId, r.months])).toEqual([['acct_leumi', ['2030-02', '2030-03']]])
  })
})
