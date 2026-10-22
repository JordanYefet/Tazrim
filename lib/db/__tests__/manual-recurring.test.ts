import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction } from '../../parsers/types'

// ENG-71: manual recurring series end to end on a throwaway DB. Made-up rows only.

let db: TestDb
let bank: typeof import('../bank')
let recurring: typeof import('../recurring')
let manual: typeof import('../manual-recurring')
let accounts: typeof import('../accounts')
let create: typeof import('@/app/api/recurring/manual/route')
let one: typeof import('@/app/api/recurring/manual/[id]/route')
let members: typeof import('@/app/api/recurring/manual/[id]/members/route')
let preview: typeof import('@/app/api/recurring/manual/preview/route')
let txRoute: typeof import('@/app/api/recurring/transaction/route')

const bt = (month: number, day: number, description: string, debit: number): ParsedBankTransaction => ({
  date: new Date(2030, month - 1, day),
  originalDescription: description,
  description,
  debit,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake-bank.xls',
})

// a cheque on the 3rd: ₪2,000 Jan-Jun, ₪4,000 Jul-Oct, a new 7-digit number every month,
// a monthly utility the detector finds, and an unrelated cheque mid-month
const rows = [
  ...Array.from({ length: 10 }, (_, i) => bt(i + 1, 3, `שיק ${5550100 + i}`, i < 6 ? 2000 : 4000)),
  ...Array.from({ length: 10 }, (_, i) => bt(i + 1, 15, 'FAKE POWER CO', 300)),
  bt(5, 20, 'שיק 7770001', 750),
]

const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/api/recurring/manual', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const idsOf = async (where: string) =>
  (await db.query<{ id: string }>(`SELECT id FROM BankTransaction WHERE ${where} ORDER BY date`)).map(r => r.id)

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_fake_bank2', 'BANK', 'otherbank', 'Fake second bank', 1900000000000);`)
  usePrismaOn(db)
  bank = await import('../bank')
  recurring = await import('../recurring')
  manual = await import('../manual-recurring')
  accounts = await import('../accounts')
  create = await import('@/app/api/recurring/manual/route')
  one = await import('@/app/api/recurring/manual/[id]/route')
  members = await import('@/app/api/recurring/manual/[id]/members/route')
  preview = await import('@/app/api/recurring/manual/preview/route')
  txRoute = await import('@/app/api/recurring/transaction/route')
  await bank.upsertBankTransactions(rows, 'acct_leumi')
  await bank.upsertBankTransactions([bt(1, 3, 'FAKE GYM', 99), bt(2, 3, 'FAKE GYM', 99), bt(3, 3, 'FAKE GYM', 99)], 'acct_fake_bank2')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('manual recurring series', () => {
  let seriesId: string

  it('before: the detector splits the cheque in two and counts it at both levels', async () => {
    const r = await recurring.getRecurringSeries()
    const cheques = r.series.filter(s => s.detectedName === 'שיק')
    expect(cheques.map(s => s.latestAmount).sort()).toEqual([2000, 4000])
  })

  it('the mark sheet suggests a name and rule without the cheque number, and shows the detected series', async () => {
    const [first] = await idsOf(`originalDescription LIKE 'שיק 555%'`)
    const res = await txRoute.GET(new Request(`http://localhost/api/recurring/transaction?source=bank&id=${first}`))
    const body = await res.json()
    expect(body.transaction.suggestion).toEqual({ name: 'שיק', pattern: 'שיק', cadence: 'monthly' })
    expect(body.series).toMatchObject({ name: 'שיק', latestAmount: 2000, manualId: null })
    expect(body.manualSeries).toEqual([])
  })

  it('previews the matches live, before saving', async () => {
    const [first] = await idsOf(`originalDescription LIKE 'שיק 555%'`)
    const res = await preview.POST(
      json({ accountId: 'acct_leumi', cadence: 'monthly', pattern: 'שיק', dayFrom: 1, dayTo: 6, amountMin: null, amountMax: null, attachedIds: [first], detachedIds: [] })
    )
    const p = await res.json()
    expect(p.occurrences).toBe(10)
    expect(p.rows.every((r: { state: string }) => r.state === 'rule')).toBe(true)
    expect(p.rows[0].from).toBe('שיק') // moves from the detected series
    expect(p.priceIncrease).toEqual({ from: 2000, to: 4000, since: '2030-07-03' })
  })

  it('creates the series; it replaces the detected ones and counts once in the total', async () => {
    const before = await recurring.getRecurringSeries()
    const [first] = await idsOf(`originalDescription LIKE 'שיק 555%'`)
    const res = await create.POST(
      json({ accountId: 'acct_leumi', name: 'גן ילדים', cadence: 'monthly', pattern: 'שיק 5550100', dayFrom: 1, dayTo: 6, attachedIds: [first] })
    )
    expect(res.status).toBe(201)
    seriesId = (await res.json()).id

    const r = await recurring.getRecurringSeries()
    const s = r.series.find(x => x.manual)!
    expect(s).toMatchObject({ name: 'גן ילדים', occurrences: 10, latestAmount: 4000, active: true, nextDate: '2030-11-03' })
    expect(s.manual).toEqual({ id: seriesId, pattern: 'שיק', dayFrom: 1, dayTo: 6, amountMin: null, amountMax: null, attachedIds: [first], detachedIds: [] })
    expect(r.series.filter(x => x.detectedName === 'שיק' && !x.manual)).toEqual([])
    expect(r.subscriptions.map(x => x.key)).toContain(s.key)
    // both detected levels were counted before; now one series at the current level
    const oldCheques = before.subscriptions.filter(x => x.detectedName === 'שיק').reduce((a, x) => a + x.monthlyAmount, 0)
    expect(r.total).toBeCloseTo(before.total - oldCheques + 4000, 2)
    const all = r.series.flatMap(x => x.transactionIds)
    expect(all).toHaveLength(new Set(all).size)
    expect(r.transactionIds.has(s.transactionIds[0])).toBe(true)
  })

  it('a transaction already in the manual series reports it', async () => {
    const [first] = await idsOf(`originalDescription LIKE 'שיק 555%'`)
    const body = await (await txRoute.GET(new Request(`http://localhost/api/recurring/transaction?source=bank&id=${first}`))).json()
    expect(body.series.manualId).toBe(seriesId)
    expect(body.manualSeries.map((m: { id: string }) => m.id)).toEqual([seriesId])
  })

  it('detaches one row and attaches another by hand', async () => {
    const ids = await idsOf(`originalDescription LIKE 'שיק 555%'`)
    const [other] = await idsOf(`originalDescription = 'שיק 7770001'`)
    expect((await members.POST(json({ transactionId: ids[9], mode: 'detach' }), ctx(seriesId))).status).toBe(204)
    expect((await members.POST(json({ transactionId: other, mode: 'attach' }), ctx(seriesId))).status).toBe(204)

    const s = (await recurring.getRecurringSeries()).series.find(x => x.manual)!
    expect(s.transactionIds).not.toContain(ids[9])
    expect(s.transactionIds).toContain(other)
    expect(s.occurrences).toBe(10)

    const p = await (
      await preview.POST(
        json({ accountId: 'acct_leumi', seriesId, cadence: 'monthly', pattern: 'שיק', dayFrom: 1, dayTo: 6, attachedIds: [ids[0], other], detachedIds: [ids[9]] })
      )
    ).json()
    const state = (id: string) => p.rows.find((r: { id: string }) => r.id === id)?.state
    expect(state(ids[9])).toBe('detached')
    expect(state(other)).toBe('attached')
  })

  it('edits name, cadence and rule', async () => {
    const res = await one.PATCH(json({ name: 'גן', cadence: 'bimonthly', dayFrom: null, dayTo: null }, 'PATCH'), ctx(seriesId))
    expect(res.status).toBe(204)
    const s = (await recurring.getRecurringSeries()).series.find(x => x.manual)!
    expect(s).toMatchObject({ name: 'גן', cadence: 'bimonthly', monthlyAmount: 2000 })
    expect(s.manual).toMatchObject({ dayFrom: null, dayTo: null })
  })

  it('rejects bad input', async () => {
    expect((await one.PATCH(json({ cadence: 'weekly' }, 'PATCH'), ctx(seriesId))).status).toBe(400)
    expect((await one.PATCH(json({ dayFrom: 3 }, 'PATCH'), ctx(seriesId))).status).toBe(400)
    expect((await one.PATCH(json({ pattern: '', attachedIds: [] }, 'PATCH'), ctx(seriesId))).status).toBe(400)
    expect((await create.POST(json({ accountId: 'nope', name: 'x', cadence: 'monthly', pattern: 'x' }))).status).toBe(404)
    expect((await one.PATCH(json({ name: 'x' }, 'PATCH'), ctx('nope'))).status).toBe(404)
  })

  it('ignores transactions of another account when attaching', async () => {
    const [gym] = (await db.query<{ id: string }>(`SELECT id FROM BankTransaction WHERE accountId = 'acct_fake_bank2' LIMIT 1`)).map(r => r.id)
    await members.POST(json({ transactionId: gym, mode: 'attach' }), ctx(seriesId))
    const s = (await recurring.getRecurringSeries()).series.find(x => x.manual)!
    expect(s.transactionIds).not.toContain(gym)
  })

  it('removing the series gives the rows back to detection', async () => {
    expect((await one.DELETE(new Request('http://localhost'), ctx(seriesId))).status).toBe(204)
    expect(db.query(`SELECT * FROM ManualRecurringMember`)).toEqual([])
    const r = await recurring.getRecurringSeries()
    expect(r.series.filter(x => x.manual)).toEqual([])
    expect(r.series.filter(x => x.detectedName === 'שיק')).toHaveLength(2)
    expect((await one.DELETE(new Request('http://localhost'), ctx(seriesId))).status).toBe(404)
  })

  it('taking over a detected series drops its stale override', async () => {
    await recurring.renameRecurring({ key: 'bank|acct_leumi|fake power co|monthly', baseKey: 'bank|acct_leumi|fake power co' }, 'Old name')
    const result = await manual.createManualSeries(
      'acct_leumi',
      { name: 'Power', cadence: 'monthly', pattern: 'fake power co', dayFrom: null, dayTo: null, amountMin: null, amountMax: null, attachedIds: [], detachedIds: [] },
      { replaceOverrideKeys: ['bank|acct_leumi|fake power co|monthly'] }
    )
    expect(result.status).toBe('ok')
    expect(db.query(`SELECT * FROM RecurringSeriesOverride`)).toEqual([])
  })

  it('deleting the account deletes its manual series and their members', async () => {
    const r = await manual.createManualSeries('acct_fake_bank2', {
      name: 'Gym', cadence: 'monthly', pattern: 'fake gym', dayFrom: null, dayTo: null, amountMin: null, amountMax: null,
      attachedIds: await idsOf(`accountId = 'acct_fake_bank2'`), detachedIds: [],
    })
    expect(r.status).toBe('ok')
    const del = await accounts.deleteAccount('acct_fake_bank2', { confirmName: 'Fake second bank' })
    expect(del.status).toBe('deleted')
    expect(db.query(`SELECT accountId FROM ManualRecurringSeries`)).toEqual([{ accountId: 'acct_leumi' }])
    expect(db.query(`SELECT * FROM ManualRecurringMember`)).toEqual([])
  })
})

describe('amount ranges through the API', () => {
  it('validates the range, and two series with one description stay apart', async () => {
    const bad = await create.POST(json({ accountId: 'acct_leumi', name: 'x', cadence: 'monthly', pattern: 'שיק', amountMin: 500, amountMax: 100 }))
    expect(bad.status).toBe(400)
    const a = await create.POST(json({ accountId: 'acct_leumi', name: 'גן ילדים', cadence: 'monthly', pattern: 'שיק', amountMin: 1800, amountMax: 4500 }))
    const b = await create.POST(json({ accountId: 'acct_leumi', name: 'שיק אחר', cadence: 'monthly', pattern: 'שיק', amountMin: 500, amountMax: 1000 }))
    expect([a.status, b.status]).toEqual([201, 201])
    const r = await recurring.getRecurringSeries()
    const kinder = r.series.find(s => s.name === 'גן ילדים')!
    const other = r.series.find(s => s.name === 'שיק אחר')!
    expect(kinder.occurrences).toBe(10)
    expect(kinder.manual).toMatchObject({ amountMin: 1800, amountMax: 4500 })
    expect(other.occurrences).toBe(1)
    expect(other.latestAmount).toBe(750)

    const p = await (await preview.POST(json({ accountId: 'acct_leumi', cadence: 'monthly', pattern: 'שיק', amountMin: 700, amountMax: 800 }))).json()
    expect(p.rows.map((x: { state: string; from?: string }) => [x.state, x.from])).toEqual([['other', 'שיק אחר']])

    const labels = await manual.manualLabels(['acct_leumi'])
    expect(new Set(labels.values())).toEqual(new Set(['גן ילדים', 'שיק אחר', 'Power']))
    expect([...labels.values()].filter(v => v === 'גן ילדים')).toHaveLength(10)

    const { id } = await a.json()
    expect((await one.PATCH(json({ amountMin: null, amountMax: null }, 'PATCH'), ctx(id))).status).toBe(204)
    const after = (await recurring.getRecurringSeries()).series.find(s => s.name === 'גן ילדים')!
    expect(after.manual).toMatchObject({ amountMin: null, amountMax: null })
  })
})

const MIGRATION = '20261022000000_manual_recurring'

describe(`${MIGRATION} migration`, () => {
  it('adds the tables, and down.sql removes them with the other rows intact', () => {
    const t = createTestDb({ before: MIGRATION })
    try {
      const tables = () => t.query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name`)
      t.exec(`INSERT INTO "RecurringSeriesOverride" ("id","key","baseKey","status","updatedAt") VALUES ('o1','bank|x|y|monthly','bank|x|y','CONFIRMED',1900000000000);`)
      const before = { tables: tables(), overrides: t.query(`SELECT * FROM "RecurringSeriesOverride"`), migrations: t.query(`SELECT migration_name FROM "_prisma_migrations"`) }

      t.applyMigration(MIGRATION)
      t.exec(`INSERT INTO "ManualRecurringSeries" ("id","accountId","source","name","cadence","pattern","updatedAt") VALUES ('s1','acct_leumi','bank','Fake','monthly','שיק',1900000000000);
        INSERT INTO "ManualRecurringMember" ("id","seriesId","transactionId","mode") VALUES ('m1','s1','tx1','ATTACHED');`)
      expect(t.query(`SELECT pattern, dayFrom, dayTo FROM "ManualRecurringSeries"`)).toEqual([{ pattern: 'שיק', dayFrom: null, dayTo: null }])

      t.applyDown(MIGRATION)
      expect(tables()).toEqual(before.tables)
      expect(t.query(`SELECT * FROM "RecurringSeriesOverride"`)).toEqual(before.overrides)
      expect(t.query(`SELECT migration_name FROM "_prisma_migrations"`)).toEqual(before.migrations)

      t.applyMigration(MIGRATION)
      expect(t.query(`SELECT count(*) AS n FROM "ManualRecurringSeries"`)).toEqual([{ n: 0 }])
    } finally {
      t.cleanup()
    }
  })
})

const RANGE = '20261022010000_manual_recurring_amount_range'

describe(`${RANGE} migration`, () => {
  it('adds nullable amountMin / amountMax, and down.sql removes them with the series intact', () => {
    const t = createTestDb({ before: RANGE })
    try {
      const cols = () => t.query<{ name: string }>(`SELECT name FROM pragma_table_info('ManualRecurringSeries') ORDER BY cid`).map(c => c.name)
      t.exec(`INSERT INTO "ManualRecurringSeries" ("id","accountId","source","name","cadence","pattern","updatedAt") VALUES ('s1','acct_leumi','bank','Fake','monthly','שיק',1900000000000);`)
      const before = { cols: cols(), rows: t.query(`SELECT * FROM "ManualRecurringSeries"`) }
      t.applyMigration(RANGE)
      expect(cols()).toEqual([...before.cols, 'amountMax', 'amountMin'])
      expect(t.query(`SELECT amountMin, amountMax FROM "ManualRecurringSeries"`)).toEqual([{ amountMin: null, amountMax: null }])
      t.exec(`UPDATE "ManualRecurringSeries" SET "amountMin" = 1800, "amountMax" = 4500;`)
      t.applyDown(RANGE)
      expect(cols()).toEqual(before.cols)
      expect(t.query(`SELECT * FROM "ManualRecurringSeries"`)).toEqual(before.rows)
      expect(t.query(`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '${RANGE}'`)).toEqual([])
      t.applyMigration(RANGE)
      expect(cols()).toContain('amountMin')
    } finally {
      t.cleanup()
    }
  })
})
