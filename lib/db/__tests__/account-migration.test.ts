import { afterEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './test-db'

const MIGRATION = '20261013000000_add_account'

// Made-up legacy rows (pre-ENG-18 schema). Dates are epoch ms, as Prisma stores them.
const LEGACY_FIXTURES = `
INSERT INTO "BankTransaction" ("id","date","originalDescription","description","debit","credit","balance","note","ignored","sourceFile") VALUES
  ('b1', 1700000000000, 'SHOP A', 'Shop A', 10, 0, 100, '', false, 'bank-1.xls'),
  ('b2', 1700086400000, 'SALARY X', 'Salary X', 0, 50, 150, 'n', true, 'bank-1.xls');
INSERT INTO "CreditCardTransaction" ("id","transactionDate","billingDate","originalMerchantName","merchantName","category","categoryOverride","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType","notes","ignored","cardProvider","contentHash","sourceFile") VALUES
  ('c1', 1700000000000, 1702000000000, 'CAFE B', 'Cafe B', 'Food', NULL, 12.5, 12.5, 'ILS', '0000', 'regular', '', false, 'MAX', 'h1', 'max-1.xlsx'),
  ('c2', 1700000000000, 1702000000000, 'STORE C', 'Store C', 'Shopping', 'Gifts', 7, 7, 'ILS', '0000', 'regular', '', false, 'MAX', 'h2', '');
INSERT INTO "TransactionAlias" ("id","source","originalName","displayName","categoryOverride") VALUES
  ('a1', 'BANK', 'SHOP A', 'Shop A', NULL),
  ('a2', 'MAX', 'CAFE B', 'Cafe B', 'Food'),
  ('a3', 'HITECH', 'CAFE B', 'Cafe B (h)', NULL);
INSERT INTO "UploadHistory" ("id","fileName","uploadedAt","recordCount","source") VALUES
  ('u1', 'bank-1.xls', 1700000000000, 2, 'BANK'),
  ('u2', 'max-1.xlsx', 1700000000000, 2, 'MAX');
`

const SNAPSHOT_TABLES = ['BankTransaction', 'CreditCardTransaction', 'TransactionAlias', 'UploadHistory', 'Category']

function schemaOf(db: TestDb) {
  return db
    .query<{ type: string; name: string; sql: string | null }>(
      `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`
    )
}

function rowsOf(db: TestDb) {
  return Object.fromEntries(
    SNAPSHOT_TABLES.map(t => [t, db.query(`SELECT * FROM "${t}" ORDER BY id`)])
  )
}

let db: TestDb | undefined
afterEach(() => db?.cleanup())

describe(`${MIGRATION} migration`, () => {
  it('creates the Leumi and MAX accounts with fixed ids and no card digits', () => {
    db = createTestDb()
    const accounts = db.query(`SELECT id, kind, provider, cardLastFour, archived, createdAt FROM "Account" ORDER BY id`)
    expect(accounts).toEqual([
      { id: 'acct_leumi', kind: 'BANK', provider: 'leumi', cardLastFour: null, archived: 0, createdAt: 1791849600000 },
      { id: 'acct_max', kind: 'CREDIT_CARD', provider: 'max', cardLastFour: null, archived: 0, createdAt: 1791849600000 },
    ])
  })

  it('back-fills every existing row', () => {
    db = createTestDb({ before: MIGRATION })
    db.exec(LEGACY_FIXTURES)
    db.applyMigration(MIGRATION)

    expect(db.query(`SELECT id, accountId FROM "BankTransaction" ORDER BY id`)).toEqual([
      { id: 'b1', accountId: 'acct_leumi' },
      { id: 'b2', accountId: 'acct_leumi' },
    ])
    expect(db.query(`SELECT id, accountId FROM "CreditCardTransaction" ORDER BY id`)).toEqual([
      { id: 'c1', accountId: 'acct_max' },
      { id: 'c2', accountId: 'acct_max' },
    ])
    expect(db.query(`SELECT id, accountId FROM "UploadHistory" ORDER BY id`)).toEqual([
      { id: 'u1', accountId: 'acct_leumi' },
      { id: 'u2', accountId: 'acct_max' },
    ])
    expect(db.query(`SELECT id, provider FROM "TransactionAlias" ORDER BY id`)).toEqual([
      { id: 'a1', provider: 'leumi' },
      { id: 'a2', provider: 'max' },
      { id: 'a3', provider: 'hitech' },
    ])
    // Other columns survive untouched
    expect(db.query(`SELECT note, ignored, balance FROM "BankTransaction" WHERE id = 'b2'`)).toEqual([
      { note: 'n', ignored: 1, balance: 150 },
    ])
    expect(db.query(`SELECT categoryOverride, contentHash, sourceFile FROM "CreditCardTransaction" WHERE id = 'c2'`)).toEqual([
      { categoryOverride: 'Gifts', contentHash: 'h2', sourceFile: '' },
    ])
    expect(db.query(`PRAGMA foreign_key_check`)).toEqual([])
  })

  it('creates a HITECH account only when HITECH rows exist', () => {
    db = createTestDb({ before: MIGRATION })
    db.exec(LEGACY_FIXTURES)
    db.exec(`INSERT INTO "CreditCardTransaction" ("id","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType","cardProvider") VALUES
      ('c3', 1700000000000, 1702000000000, 'CAFE B', 'Cafe B', 'Food', 3, 3, 'ILS', '0000', 'regular', 'HITECH');`)
    db.applyMigration(MIGRATION)

    expect(db.query(`SELECT id, kind, provider FROM "Account" WHERE id = 'acct_hitech'`)).toEqual([
      { id: 'acct_hitech', kind: 'CREDIT_CARD', provider: 'hitech' },
    ])
    expect(db.query(`SELECT accountId FROM "CreditCardTransaction" WHERE id = 'c3'`)).toEqual([
      { accountId: 'acct_hitech' },
    ])
  })

  it('is reversed by down.sql: same schema and same rows as before', () => {
    db = createTestDb({ before: MIGRATION })
    db.exec(LEGACY_FIXTURES)
    const schemaBefore = schemaOf(db)
    const rowsBefore = rowsOf(db)
    const migrationsBefore = db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)

    db.applyMigration(MIGRATION)
    expect(schemaOf(db)).not.toEqual(schemaBefore)
    db.applyDown(MIGRATION)

    expect(schemaOf(db)).toEqual(schemaBefore)
    expect(rowsOf(db)).toEqual(rowsBefore)
    expect(db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)).toEqual(migrationsBefore)
  })
})
