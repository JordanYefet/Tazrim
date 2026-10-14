import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// Made-up merchants, amounts and dates only.
let db: TestDb
let unusual: typeof import('../unusual')
let prisma: typeof import('../client')['prisma']

let seq = 0
const nextId = (p: string) => `${p}${String(++seq).padStart(3, '0')}`

async function bank(date: string, debit: number, description: string, over: Record<string, unknown> = {}) {
  const id = nextId('b')
  await prisma.bankTransaction.create({
    data: {
      id,
      accountId: 'acct_leumi',
      date: new Date(`${date}T10:00:00`),
      originalDescription: description,
      description,
      debit,
      credit: 0,
      balance: 1000,
      sourceFile: 'fake.xls',
      ...over,
    },
  })
  return id
}

async function card(date: string, amount: number, merchant: string, over: Record<string, unknown> = {}) {
  const id = nextId('c')
  await prisma.creditCardTransaction.create({
    data: {
      id,
      accountId: 'acct_max',
      transactionDate: new Date(`${date}T10:00:00`),
      billingDate: new Date(`${date}T10:00:00`),
      originalMerchantName: merchant,
      merchantName: merchant,
      category: 'מסעדות',
      chargedAmount: amount,
      originalAmount: amount,
      originalCurrency: 'ILS',
      cardLastFour: '',
      transactionType: 'regular',
      ...over,
    },
  })
  return id
}

/** Four ordinary visits to a fake café */
async function cafeHistory(merchant = 'Fake Cafe') {
  for (const [d, a] of [['2030-01-03', 40], ['2030-01-10', 45], ['2030-01-17', 50], ['2030-01-24', 42]] as const) {
    await card(d, a, merchant)
  }
}

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_test_card2', 'CREDIT_CARD', 'max', 'Second test card', 1900000000000);`)
  usePrismaOn(db)
  unusual = await import('../unusual')
  prisma = (await import('../client')).prisma
})

beforeEach(async () => {
  await prisma.unusualDismissal.deleteMany()
  await prisma.bankTransaction.deleteMany()
  await prisma.creditCardTransaction.deleteMany()
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('isCardPaymentDescription', () => {
  it('matches card-company payment debits', () => {
    for (const d of ['מקס איט פיננסים-י', 'תשלום כרטיסי אשראי', 'ישראכרט', 'ויזה כאל', 'לאומי קארד', 'MAX IT', 'Isracard', 'אמריקן אקספרס'])
      expect(unusual.isCardPaymentDescription(d), d).toBe(true)
  })

  it('does not match ordinary descriptions that merely contain the letters', () => {
    for (const d of ['מיכאל הדוגמה', 'מקסימום בדיקה', 'Fake Maximal Store', 'העברה לחשבון'])
      expect(unusual.isCardPaymentDescription(d), d).toBe(false)
  })
})

describe('unusualRange', () => {
  const now = new Date(2030, 5, 15)

  it('covers the selected month', () => {
    expect(unusual.unusualRange({ year: 2030, month: 2, now })).toEqual({ since: '2030-02-01', until: '2030-02-28' })
  })

  it('covers a past year in full', () => {
    expect(unusual.unusualRange({ year: 2029, now })).toEqual({ since: '2029-01-01', until: '2029-12-31' })
  })

  it('covers the last 90 days in the current year', () => {
    expect(unusual.unusualRange({ year: 2030, now })).toEqual({ since: '2030-03-17', until: '2030-06-15' })
  })
})

describe('getUnusualTransactions', () => {
  it('flags a one-off large charge and a duplicate, but not normal variation', async () => {
    await cafeHistory()
    const big = await card('2030-02-01', 420, 'Fake Cafe')
    await card('2030-02-02', 60, 'Fake Cafe') // normal variation
    await bank('2030-02-10', 700, 'Fake Bike Shop')
    const dup = await bank('2030-02-11', 700, 'Fake Bike Shop')

    const r = await unusual.getUnusualTransactions()
    expect(r.map(u => [u.id, u.flags[0].reason])).toEqual([
      [dup, 'possible_duplicate'],
      [big, 'merchant_outlier'],
    ])
  })

  it('never flags or learns from the bank card-payment debit', async () => {
    for (const [d, a] of [['2030-01-02', 900], ['2030-02-02', 1000], ['2030-03-02', 950], ['2030-04-02', 9000]] as const)
      await bank(d, a, 'תשלום כרטיסי אשראי')
    expect(await unusual.getUnusualTransactions()).toEqual([])
  })

  it('ignores rows the user marked as ignored', async () => {
    await cafeHistory()
    await card('2030-02-01', 420, 'Fake Cafe', { ignored: true })
    expect(await unusual.getUnusualTransactions()).toEqual([])
  })

  it('does not check person-to-person transfers for duplicates', async () => {
    await card('2030-02-01', 200, 'Fake Pay App', { category: 'העברת כספים' })
    await card('2030-02-01', 200, 'Fake Pay App', { category: 'העברת כספים' })
    expect(await unusual.getUnusualTransactions()).toEqual([])
  })

  it('limits flagging to since/until while using the full history', async () => {
    await cafeHistory()
    const feb = await card('2030-02-01', 420, 'Fake Cafe')
    await card('2030-03-01', 900, 'Fake Cafe')
    const r = await unusual.getUnusualTransactions({ since: '2030-02-01', until: '2030-02-28' })
    expect(r.map(u => u.id)).toEqual([feb])
  })

  it('puts a card row in the period of its billing date; history and duplicates use the purchase date', async () => {
    await cafeHistory()
    // Bought in June, billed in September
    const big = await card('2030-06-10', 420, 'Fake Cafe', { billingDate: new Date('2030-09-02T10:00:00') })
    expect(await unusual.getUnusualTransactions({ since: '2030-06-01', until: '2030-06-30' })).toEqual([])
    const sept = await unusual.getUnusualTransactions({ since: '2030-09-01', until: '2030-09-30' })
    expect(sept.map(u => [u.id, u.date, u.flags[0].reason])).toEqual([[big, '2030-06-10', 'merchant_outlier']])
  })

  it('finds a duplicate by purchase date even when the copies are billed in different months', async () => {
    const a = await card('2030-06-29', 300, 'Fake Bike Shop', { billingDate: new Date('2030-07-02T10:00:00') })
    const b = await card('2030-06-30', 300, 'Fake Bike Shop', { billingDate: new Date('2030-08-02T10:00:00') })
    const r = await unusual.getUnusualTransactions({ since: '2030-08-01', until: '2030-08-31' })
    expect(r.map(u => [u.id, u.flags[0]])).toEqual([[b, { reason: 'possible_duplicate', duplicateOfId: a, daysApart: 1 }]])
  })

  it('scopes to the given accounts', async () => {
    await cafeHistory()
    await card('2030-02-01', 420, 'Fake Cafe')
    expect(await unusual.getUnusualTransactions({ accountId: 'acct_test_card2' })).toEqual([])
    expect(await unusual.getUnusualTransactions({ accountId: ['acct_max'] })).toHaveLength(1)
    expect(await unusual.getUnusualTransactions({ accountId: 'acct_leumi' })).toEqual([])
  })

  it('passes recurring exemptions through', async () => {
    await cafeHistory()
    const big = await card('2030-02-01', 420, 'Fake Cafe')
    expect(await unusual.getUnusualTransactions({ recurring: { ids: [big] } })).toEqual([])
  })
})

describe('dismissals', () => {
  it('hides a dismissed transaction but keeps it as history, and undo brings it back', async () => {
    await cafeHistory()
    const big = await card('2030-02-01', 420, 'Fake Cafe')
    await card('2030-03-01', 400, 'Fake Cafe') // ordinary once 420 is history

    await unusual.dismissUnusual({ source: 'card', transactionId: big, reason: 'merchant_outlier' })
    await unusual.dismissUnusual({ source: 'card', transactionId: big }) // idempotent
    expect(await unusual.getUnusualTransactions()).toEqual([])
    expect(await prisma.unusualDismissal.count()).toBe(1)

    await unusual.undismissUnusual({ source: 'card', transactionId: big })
    expect((await unusual.getUnusualTransactions()).map(u => u.id)).toEqual([big])
  })

  it('keys dismissals by source', async () => {
    await cafeHistory()
    const big = await card('2030-02-01', 420, 'Fake Cafe')
    await unusual.dismissUnusual({ source: 'bank', transactionId: big })
    expect(await unusual.getUnusualTransactions()).toHaveLength(1)
  })

  it('rejects an unknown source', async () => {
    await expect(unusual.dismissUnusual({ source: 'cash' as 'bank', transactionId: 'x' })).rejects.toThrow()
  })
})

describe('latestTransactionDate', () => {
  it('is the newest non-ignored bank or card date, or null', async () => {
    expect(await unusual.latestTransactionDate()).toBeNull()
    await bank('2030-02-10', 70, 'Fake Shop')
    await card('2030-03-05', 70, 'Fake Shop')
    await card('2030-04-01', 70, 'Fake Shop', { ignored: true })
    expect(unusual.unusualRange({ year: 2030, now: (await unusual.latestTransactionDate())! }).until).toBe('2030-03-05')
  })

  it('uses the billing date of card rows', async () => {
    await bank('2030-02-10', 70, 'Fake Shop')
    await card('2030-01-20', 70, 'Fake Shop', { billingDate: new Date('2030-03-02T10:00:00') })
    expect(unusual.unusualRange({ year: 2030, now: (await unusual.latestTransactionDate())! }).until).toBe('2030-03-02')
  })
})

describe('getUnusualFlagMap', () => {
  it('groups flags by source and transaction id', async () => {
    await cafeHistory()
    const big = await card('2030-02-01', 420, 'Fake Cafe')
    await bank('2030-02-10', 700, 'Fake Bike Shop')
    const dup = await bank('2030-02-11', 700, 'Fake Bike Shop')
    const map = await unusual.getUnusualFlagMap()
    expect(Object.keys(map.card)).toEqual([big])
    expect(Object.keys(map.bank)).toEqual([dup])
    expect(map.bank[dup][0].reason).toBe('possible_duplicate')
  })
})
