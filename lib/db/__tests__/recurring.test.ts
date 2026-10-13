import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

let db: TestDb
let bank: typeof import('../bank')
let cards: typeof import('../cards')
let recurring: typeof import('../recurring')

// Made-up rows only
const cc = (month: number, over: Partial<ParsedCCTransaction> = {}): ParsedCCTransaction => ({
  transactionDate: new Date(2030, month - 1, 5),
  billingDate: new Date(2030, month, 2),
  originalMerchantName: 'STREAMLY P1A2B3C4D',
  merchantName: 'STREAMLY P1A2B3C4D',
  category: 'Leisure',
  chargedAmount: 40,
  originalAmount: 40,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})

const bt = (month: number, over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, month - 1, 15),
  originalDescription: 'POWERCO',
  description: 'POWERCO',
  debit: 250,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'bank-test.xls',
  ...over,
})

const months = [1, 2, 3, 4, 5]
const cardRows = [
  ...months.map(m => cc(m)),
  ...months.map(m => cc(m, { originalMerchantName: 'GYMCO', merchantName: 'GYMCO', chargedAmount: 150, transactionDate: new Date(2030, m - 1, 8) })),
  // installment plan: every row carries the purchase date, the billing date moves
  ...[1, 2, 3, 4].map(m =>
    cc(m, {
      originalMerchantName: 'SOFACO',
      merchantName: 'SOFACO',
      chargedAmount: 250,
      transactionDate: new Date(2029, 11, 20),
      billingDate: new Date(2030, m, 2),
      transactionType: 'תשלומים',
      notes: `installment ${m}`,
    })
  ),
]
const bankRows = [
  ...months.map(m => bt(m)),
  ...months.map(m => bt(m, { originalDescription: 'מקס איט פיננסים', description: 'מקס איט פיננסים', debit: 600 + m * 10, date: new Date(2030, m - 1, 10) })),
]

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_test_card2', 'CREDIT_CARD', 'max', 'Second test card', 1900000000000);
`)
  usePrismaOn(db)
  bank = await import('../bank')
  cards = await import('../cards')
  recurring = await import('../recurring')
  await cards.upsertCCTransactions(cardRows, 'card-a.xlsx', 'acct_max')
  await bank.upsertBankTransactions(bankRows, 'acct_leumi')
  // a second card whose statements stop earlier
  await cards.upsertCCTransactions(
    [1, 2, 3].map(m => cc(m, { originalMerchantName: 'TVBOX', merchantName: 'TVBOX', chargedAmount: 30 })),
    'card-b.xlsx',
    'acct_test_card2'
  )
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const byName = <T extends { detectedName: string }>(series: T[], name: string): T => series.find(s => s.detectedName === name)!

describe('getRecurringSeries', () => {
  it('detects series on every account, tagged with the real account id', async () => {
    const r = await recurring.getRecurringSeries()
    expect(byName(r.series, 'STREAMLY').accountId).toBe('acct_max')
    expect(byName(r.series, 'POWERCO').accountId).toBe('acct_leumi')
    expect(byName(r.series, 'TVBOX').accountId).toBe('acct_test_card2')
    expect(r.accountNames.acct_test_card2).toBe('Second test card')
  })

  it('judges "today" per account, so an account whose data ends early is still current', async () => {
    const r = await recurring.getRecurringSeries()
    expect(byName(r.series, 'TVBOX').active).toBe(true)
  })

  it('keeps installments and the card payment out of the subscriptions total', async () => {
    const r = await recurring.getRecurringSeries()
    expect(r.installments.map(s => s.detectedName)).toEqual(['SOFACO'])
    expect(byName(r.series, 'SOFACO').occurrences).toBe(4)
    expect(r.cardPayments.map(s => s.detectedName)).toEqual(['מקס איט פיננסים'])
    // 150 + 40 + 30 card, 250 bank
    expect(r.total).toBe(470)
    expect(r.installmentsTotal).toBe(250)
  })

  it('filters by account', async () => {
    const r = await recurring.getRecurringSeries({ accountId: 'acct_test_card2' })
    expect(r.series.map(s => s.detectedName)).toEqual(['TVBOX'])
  })

  it('exposes matched transaction ids', async () => {
    const r = await recurring.getRecurringSeries()
    const ids = await db.query<{ id: string }>(`SELECT id FROM CreditCardTransaction WHERE originalMerchantName = 'GYMCO'`)
    expect(new Set(byName(r.series, 'GYMCO').transactionIds)).toEqual(new Set(ids.map(i => i.id)))
    expect(r.transactionIds.has(ids[0].id)).toBe(true)
  })
})

describe('overrides', () => {
  it('a dismissed series stays dismissed across re-detection and re-imports', async () => {
    const before = await recurring.getRecurringSeries()
    const gym = byName(before.series, 'GYMCO')
    await recurring.setRecurringStatus(gym, 'dismissed')

    const again = await recurring.getRecurringSeries()
    expect(byName(again.series, 'GYMCO').status).toBe('dismissed')
    expect(again.dismissed.map(s => s.detectedName)).toEqual(['GYMCO'])
    expect(again.total).toBe(before.total - 150)

    // the same statements uploaded again (new file name, same rows): deduped, nothing changes
    expect((await cards.upsertCCTransactions(cardRows, 'card-a-again.xlsx', 'acct_max')).created).toBe(0)
    expect((await bank.upsertBankTransactions(bankRows, 'acct_leumi')).created).toBe(0)
    const reimported = await recurring.getRecurringSeries()
    expect(byName(reimported.series, 'GYMCO')).toMatchObject({ key: gym.key, status: 'dismissed' })

    // and a new month's charge keeps the same key
    await cards.upsertCCTransactions([cc(6, { originalMerchantName: 'GYMCO', merchantName: 'GYMCO', chargedAmount: 150, transactionDate: new Date(2030, 5, 8) })], 'card-c.xlsx', 'acct_max')
    const extended = await recurring.getRecurringSeries()
    expect(byName(extended.series, 'GYMCO')).toMatchObject({ key: gym.key, status: 'dismissed', occurrences: 6 })
  })

  it('undo clears the status and removes an empty override', async () => {
    const gym = byName((await recurring.getRecurringSeries()).series, 'GYMCO')
    await recurring.setRecurringStatus(gym, null)
    expect(byName((await recurring.getRecurringSeries()).series, 'GYMCO').status).toBeNull()
    expect(db.query(`SELECT * FROM RecurringSeriesOverride WHERE key = '${gym.key.replace(/'/g, "''")}'`)).toHaveLength(0)
  })

  it('confirms and renames independently', async () => {
    const s = byName((await recurring.getRecurringSeries()).series, 'STREAMLY')
    await recurring.renameRecurring(s, 'Movies')
    await recurring.setRecurringStatus(s, 'confirmed')
    let r = byName((await recurring.getRecurringSeries()).series, 'STREAMLY')
    expect(r).toMatchObject({ name: 'Movies', status: 'confirmed', accountId: 'acct_max' })

    await recurring.renameRecurring(s, '  ')
    r = byName((await recurring.getRecurringSeries()).series, 'STREAMLY')
    expect(r).toMatchObject({ name: 'STREAMLY', status: 'confirmed' })
  })

  it('moves an override matched through the base key onto the current key', async () => {
    const s = byName((await recurring.getRecurringSeries()).series, 'POWERCO')
    db.exec(`INSERT INTO RecurringSeriesOverride (id, key, baseKey, accountId, status, updatedAt)
             VALUES ('old', '${s.key}|250', '${s.baseKey}', 'acct_leumi', 'DISMISSED', CURRENT_TIMESTAMP);`)
    const matched = byName((await recurring.getRecurringSeries()).series, 'POWERCO')
    expect(matched).toMatchObject({ status: 'dismissed', overrideKey: `${s.key}|250` })

    await recurring.renameRecurring(matched, 'Electricity')
    const rows = db.query<{ key: string; status: string; displayName: string }>(
      `SELECT key, status, displayName FROM RecurringSeriesOverride WHERE baseKey = '${s.baseKey}'`
    )
    expect(rows).toEqual([{ key: s.key, status: 'DISMISSED', displayName: 'Electricity' }])
  })

  it('rejects unknown statuses', async () => {
    const s = byName((await recurring.getRecurringSeries()).series, 'STREAMLY')
    await expect(recurring.setRecurringStatus(s, 'maybe' as never)).rejects.toThrow()
  })
})

describe('20261013010000_recurring_overrides down.sql', () => {
  it('drops the table and its migration row', () => {
    const t = createTestDb()
    try {
      t.exec(`INSERT INTO RecurringSeriesOverride (id, key, baseKey, status, updatedAt) VALUES ('x', 'k', 'b', 'DISMISSED', CURRENT_TIMESTAMP);`)
      t.applyDown('20261013010000_recurring_overrides')
      expect(t.query(`SELECT name FROM sqlite_master WHERE name LIKE 'RecurringSeriesOverride%'`)).toEqual([])
      expect(t.query(`SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261013010000_recurring_overrides'`)).toEqual([])
      expect(t.query(`SELECT count(*) AS n FROM Account`)).toEqual([{ n: 2 }])
    } finally {
      t.cleanup()
    }
  })
})
