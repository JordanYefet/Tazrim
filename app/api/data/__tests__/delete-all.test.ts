import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { DELETE_ALL_PHRASE, matchesDeleteAllPhrase } from '@/lib/data/delete-all-phrase'
import { STARTING_CATEGORIES } from '@/lib/db/starting-categories'
import { STARTING_GENERIC_DESCRIPTIONS } from '@/lib/db/starting-generic-descriptions'

// All values are made up.

let db: TestDb
let route: typeof import('../delete-all/route')
let wipe: typeof import('@/lib/db/wipe')

/** One made-up row in every data table (the migration already adds acct_leumi and acct_max). */
const SEED = `
  INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_test_card', 'CREDIT_CARD', 'max', 'Test card', 1900000000000);
  INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","credit","balance","note","ignored","sourceFile") VALUES
    ('b1','acct_leumi',1893456000000,'Fake Employer','Fake Employer',0,1000,1000,'',0,'fake.xlsx');
  INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType") VALUES
    ('c1','acct_test_card',1893456000000,1893456000000,'Fake Shop','Fake Shop','cat',7,7,'ILS','0000','regular');
  INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName") VALUES ('a1','max','Fake Shop','Shop');
  INSERT INTO "BankCategoryRule" ("id","provider","originalDescription","direction","category") VALUES ('bcr1','leumi','Fake Employer','IN','Fake income');
  INSERT INTO "CategoryKeywordRule" ("id","pattern","category","createdAt") VALUES ('kr1','FAKE SHOP','Fake category',1893456000000);
  INSERT INTO "CategoryMapping" ("id","provider","sourceCategory","category") VALUES ('cm1','max','Fake issuer category','Fake category');
  INSERT INTO "UploadHistory" ("id","accountId","fileName","uploadedAt","recordCount") VALUES ('u1','acct_leumi','fake.xlsx',1893456000000,1);
  INSERT INTO "Category" ("id","name","createdAt") VALUES ('cat1','Fake category',1893456000000);
  INSERT INTO "RecurringSeriesOverride" ("id","key","baseKey","accountId","status","createdAt","updatedAt") VALUES
    ('r1','card|acct_test_card|fake shop|7','card|acct_test_card|fake shop','acct_test_card','CONFIRMED',1893456000000,1893456000000);
  INSERT INTO "UnusualDismissal" ("id","source","transactionId","createdAt") VALUES ('d1','card','c1',1893456000000);
  INSERT INTO "ManualRecurringSeries" ("id","accountId","source","name","cadence","pattern","createdAt","updatedAt") VALUES
    ('ms1','acct_test_card','card','Fake series','monthly','fake shop',1893456000000,1893456000000);
  INSERT INTO "ManualRecurringMember" ("id","seriesId","transactionId","mode") VALUES ('mm1','ms1','c1','ATTACHED');
  INSERT INTO "ImportProfile" ("id","name","accountKind","provider","mapping","headerSignature","accountId","createdAt","updatedAt") VALUES
    ('p1','Fake mapping','BANK','fakebank','{}','sig','acct_leumi',1893456000000,1893456000000);
`

/** Every table in the file except SQLite's and Prisma's own bookkeeping. */
const dataTables = () =>
  db
    .query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name`
    )
    .map(r => r.name)
const count = (table: string) => db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`)[0].n

const LOCAL = { host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000', 'x-forwarded-for': '127.0.0.1' }
const post = (body: unknown, headers: Record<string, string> = LOCAL) =>
  route.POST(
    new Request('http://localhost:3000/api/data/delete-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

beforeAll(async () => {
  db = createTestDb()
  db.exec(SEED)
  usePrismaOn(db)
  route = await import('../delete-all/route')
  wipe = await import('@/lib/db/wipe')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('wipe table list', () => {
  it('covers every Prisma model and every table in the database', () => {
    const models = Prisma.dmmf.datamodel.models.map(m => m.dbName ?? m.name).sort()
    expect([...wipe.WIPE_TABLES].sort()).toEqual(models)
    expect(dataTables()).toEqual(models)
  })

  it('the seed puts a row in every table, so the wipe test is meaningful', () => {
    for (const table of dataTables()) expect(count(table), table).toBeGreaterThan(0)
  })
})

describe('matchesDeleteAllPhrase', () => {
  it('accepts the phrase, ignoring extra spaces', () => {
    expect(matchesDeleteAllPhrase(DELETE_ALL_PHRASE)).toBe(true)
    expect(matchesDeleteAllPhrase(`  ${DELETE_ALL_PHRASE.replace(' ', '   ')} `)).toBe(true)
  })
  it('refuses anything else', () => {
    for (const v of [undefined, null, 1, '', 'מחק', 'delete all', `${DELETE_ALL_PHRASE}!`]) {
      expect(matchesDeleteAllPhrase(v)).toBe(false)
    }
  })
})

describe('POST /api/data/delete-all refusals', () => {
  it('400 for a missing, wrong or malformed confirmation, and nothing is deleted', async () => {
    for (const body of [undefined, 'not json', {}, { confirm: 'מחק' }, { confirm: 'delete all' }, { confirm: 1 }]) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('CONFIRMATION_REQUIRED')
    }
    expect(count('Account')).toBe(3)
  })

  it.each([
    ['a Forwarded header', { ...LOCAL, forwarded: 'for=127.0.0.1;host=localhost' }],
    ['a remote x-forwarded-for', { ...LOCAL, 'x-forwarded-for': '203.0.113.9' }],
    ['a mixed x-forwarded-for list', { ...LOCAL, 'x-forwarded-for': '203.0.113.9, 127.0.0.1' }],
    ['a LAN x-forwarded-for', { ...LOCAL, 'x-forwarded-for': '192.168.1.20' }],
    ['a remote host', { ...LOCAL, host: 'tazrim.example.com', 'x-forwarded-host': 'tazrim.example.com' }],
    ['a mixed x-forwarded-host list', { ...LOCAL, 'x-forwarded-host': 'localhost:3000, tazrim.example.com' }],
  ])('403 for %s, even with the right phrase, and nothing is deleted', async (_, headers) => {
    const res = await post({ confirm: DELETE_ALL_PHRASE }, headers)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('NOT_LOCAL')
    expect(count('Account')).toBe(3)
    expect(count('BankTransaction')).toBe(1)
  })
})

describe('POST /api/data/delete-all', () => {
  it('empties every table and keeps the schema and migration history', async () => {
    const migrations = count('_prisma_migrations')
    const res = await post({ confirm: ` ${DELETE_ALL_PHRASE} ` })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.deleted).toMatchObject({ Account: 3, BankTransaction: 1, CreditCardTransaction: 1, ImportProfile: 1 })

    for (const table of dataTables()) {
      if (table !== 'Category' && table !== 'GenericDescription') expect(count(table), table).toBe(0)
    }
    expect(dataTables()).toEqual([...wipe.WIPE_TABLES].sort())
    // Like a new install (ENG-76): the starting categories, and nothing else
    expect(db.query<{ name: string; kind: string }>(`SELECT name, kind FROM "Category" ORDER BY rowid`)).toEqual(
      STARTING_CATEGORIES.map(c => ({ name: c.name, kind: c.kind }))
    )
    expect(db.query<{ description: string }>(`SELECT description FROM "GenericDescription" ORDER BY rowid`).map(r => r.description)).toEqual(
      STARTING_GENERIC_DESCRIPTIONS
    )
    expect(count('_prisma_migrations')).toBe(migrations)
  })

  it('leaves a database the app can write to again, with no accounts', async () => {
    const { listAccounts, createAccount } = await import('@/lib/db/accounts')
    expect(await listAccounts({ includeArchived: true })).toEqual([])
    await createAccount({ kind: 'BANK', provider: 'leumi', displayName: 'Fake bank' })
    expect(count('Account')).toBe(1)
  })
})
