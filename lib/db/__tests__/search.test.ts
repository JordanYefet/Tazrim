import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import { parseSearchParams } from '../../search/query'

// Made-up merchants, notes, amounts and dates only: two bank accounts and
// two cards (two providers), across 2030 and 2031.
let db: TestDb
let search: typeof import('../search')
let prisma: typeof import('../client')['prisma']

let seq = 0
const nextId = (p: string) => `${p}${String(++seq).padStart(3, '0')}`

async function bank(accountId: string, date: string, description: string, over: Record<string, unknown> = {}) {
  const id = nextId('b')
  await prisma.bankTransaction.create({
    data: {
      id,
      accountId,
      date: new Date(`${date}T10:00:00`),
      originalDescription: description,
      description,
      debit: 0,
      credit: 0,
      balance: 1000,
      sourceFile: 'fake.xls',
      ...over,
    },
  })
  return id
}

async function card(accountId: string, date: string, merchant: string, amount: number, over: Record<string, unknown> = {}) {
  const id = nextId('c')
  await prisma.creditCardTransaction.create({
    data: {
      id,
      accountId,
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

const run = (params: Record<string, string | string[]>) => search.searchTransactions(parseSearchParams(params))
const ids = async (params: Record<string, string | string[]>) => (await run(params)).results.map(r => r.id)

const T: Record<string, string> = {}

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_bank2', 'BANK', 'fakebank', 'Test Bank Two', 1900000000000),
    ('acct_card2', 'CREDIT_CARD', 'fakecard', 'Test Card Two', 1900000000001);`)
  usePrismaOn(db)
  search = await import('../search')
  prisma = (await import('../client')).prisma

  T.salary = await bank('acct_leumi', '2030-02-01', 'Fake Payroll Ltd', { credit: 1200 })
  T.rent = await bank('acct_leumi', '2030-02-03', 'Fake Landlord', { debit: 120, note: 'rent for the blue flat' })
  T.bank2 = await bank('acct_bank2', '2031-05-10', 'קפה דמיוני', { debit: 33.5 })
  T.bankIgnored = await bank('acct_bank2', '2031-06-01', 'Fake Ignored Transfer', { debit: 77, ignored: true })
  T.aliased = await bank('acct_leumi', '2031-01-15', 'RAW BANK CODE 12', {
    description: 'RAW BANK CODE 12',
    debit: 10,
  })

  T.cafe = await card('acct_max', '2030-03-04', 'Fake Cafe', 120)
  T.cafeRefund = await card('acct_max', '2030-03-09', 'Fake Cafe', -120, { notes: 'refund of the double charge' })
  T.cafe2031 = await card('acct_card2', '2031-07-20', 'FAKE CAFE', 45.5, { category: 'Food' })
  T.override = await card('acct_card2', '2031-08-01', 'Fake Books', 1200.004, { categoryOverride: 'Food' })
  T.original = await card('acct_max', '2031-09-09', 'Pretty Name', 60, { originalMerchantName: 'UGLY*RAW*NAME' })
  T.wild = await card('acct_max', '2031-09-10', 'Fake 100% Store', 5)

  // A provider alias that was never applied to the stored description
  await prisma.transactionAlias.create({
    data: { provider: 'leumi', originalName: 'RAW BANK CODE 12', displayName: 'Friendly Gym' },
  })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('searchTransactions', () => {
  it('finds a merchant on every account and year, newest first, case-insensitive for Latin', async () => {
    expect(await ids({ q: 'fake cafe' })).toEqual([T.cafe2031, T.cafeRefund, T.cafe])
  })

  it('finds Hebrew descriptions in bank rows', async () => {
    const page = await run({ q: 'דמיוני' })
    expect(page.results).toHaveLength(1)
    expect(page.results[0]).toMatchObject({
      id: T.bank2,
      source: 'bank',
      accountId: 'acct_bank2',
      accountName: 'Test Bank Two',
      date: '2031-05-10',
      amount: 33.5,
      ignored: false,
    })
  })

  it('finds notes on both tables', async () => {
    expect(await ids({ q: 'blue flat' })).toEqual([T.rent])
    expect(await ids({ q: 'double' })).toEqual([T.cafeRefund])
  })

  it('finds the original statement name and the alias display name', async () => {
    const page = await run({ q: 'ugly' })
    expect(page.results.map(r => r.id)).toEqual([T.original])
    expect(page.results[0].originalDescription).toBe('UGLY*RAW*NAME')
    expect(await ids({ q: 'friendly gym' })).toEqual([T.aliased])
  })

  it('treats % and _ literally', async () => {
    expect(await ids({ q: '100%' })).toEqual([T.wild])
    expect(await ids({ q: '_' })).toEqual([])
  })

  it('exact amount matches ±0.005, charges, refunds, debits and credits', async () => {
    expect(await ids({ amount: '120' })).toEqual([T.cafeRefund, T.cafe, T.rent])
    expect(await ids({ amount: '₪1,200' })).toEqual([T.override, T.salary])
    expect(await ids({ amount: '45.5' })).toEqual([T.cafe2031])
    expect(await ids({ amount: '45.51' })).toEqual([])
  })

  it('amount range and a lone number in the text box', async () => {
    expect(await ids({ amount: '30-50' })).toEqual([T.cafe2031, T.bank2])
    expect(await ids({ q: '₪120' })).toEqual([T.cafeRefund, T.cafe, T.rent])
  })

  it('signed amount: money out positive, money in negative', async () => {
    const page = await run({ amount: '1200' })
    expect(page.results.find(r => r.id === T.salary)!.amount).toBe(-1200)
    expect(page.results.find(r => r.id === T.override)!.amount).toBeCloseTo(1200.004)
    expect((await run({ q: 'double' })).results[0].amount).toBe(-120)
  })

  it('date range, account and category filters', async () => {
    expect(await ids({ q: 'fake', from: '2030-03-01', to: '2030-03-04' })).toEqual([T.cafe])
    expect(await ids({ q: 'cafe', account: 'acct_card2' })).toEqual([T.cafe2031])
    expect(await ids({ q: 'fake', account: ['acct_leumi', 'acct_bank2'] })).toEqual([T.rent, T.salary])
    // category uses the override when there is one; bank rows have no category
    const food = await run({ category: 'Food' })
    expect(food.results.map(r => r.id)).toEqual([T.override, T.cafe2031])
    expect(food.results.map(r => r.category)).toEqual(['Food', 'Food'])
  })

  it('ignored rows only with the toggle', async () => {
    expect(await ids({ q: 'ignored' })).toEqual([])
    const page = await run({ q: 'ignored', ignored: '1' })
    expect(page.results.map(r => [r.id, r.ignored])).toEqual([[T.bankIgnored, true]])
  })

  it('no criteria: empty page without querying everything', async () => {
    expect(await run({})).toEqual({ results: [], nextCursor: null, total: 0 })
    expect(await run({ ignored: '1' })).toEqual({ results: [], nextCursor: null, total: 0 })
  })

  it('pages through both tables with the cursor, no gaps or repeats', async () => {
    const all = (await run({ q: 'fake', limit: '100' })).results.map(r => r.id)
    expect(all.length).toBe(7)
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await run({ q: 'fake', limit: '3', ...(cursor ? { cursor } : {}) })
      expect(page.total).toBe(7)
      seen.push(...page.results.map(r => r.id))
      cursor = page.nextCursor
      pages++
    } while (cursor && pages < 10)
    expect(pages).toBe(3)
    expect(seen).toEqual(all)
  })

  it('pages correctly when a bank and a card row share a timestamp', async () => {
    const b = await bank('acct_leumi', '2032-01-01', 'Tie Merchant', { debit: 1 })
    const c = await card('acct_max', '2032-01-01', 'Tie Merchant', 1)
    const first = await run({ q: 'tie merchant', limit: '1' })
    expect(first.results.map(r => r.id)).toEqual([b])
    const second = await run({ q: 'tie merchant', limit: '1', cursor: first.nextCursor! })
    expect(second.results.map(r => r.id)).toEqual([c])
    expect(second.nextCursor).toBeNull()
  })
})

describe('listSearchCategories', () => {
  it('distinct effective categories, sorted', async () => {
    const cats = await search.listSearchCategories()
    expect(cats).toEqual(expect.arrayContaining(['Food', 'מסעדות']))
    expect(new Set(cats).size).toBe(cats.length)
  })
})
