import { describe, expect, it } from 'vitest'
import { STARTING_CATEGORIES } from '../starting-categories'
import { createTestDb, type TestDb } from './test-db'

// The starting category list (ENG-76). Made-up rows only.

const MIGRATION = '20261025020000_starting_categories'

const categories = (db: TestDb) => db.query<{ name: string; kind: string }>(`SELECT name, kind FROM "Category" ORDER BY id`)

describe(`${MIGRATION} migration`, () => {
  it('gives a database with no categories the starting list, the same as lib/db/starting-categories.ts', () => {
    const db = createTestDb()
    try {
      expect(categories(db)).toEqual(STARTING_CATEGORIES.map(c => ({ name: c.name, kind: c.kind })))
    } finally {
      db.cleanup()
    }
  })

  it('leaves a database that already has categories with its own list', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Category" ("id","name","kind") VALUES ('k1','קטגוריה בדויה','EXPENSE')`)
      db.applyMigration(MIGRATION)
      expect(categories(db)).toEqual([{ name: 'קטגוריה בדויה', kind: 'EXPENSE' }])
    } finally {
      db.cleanup()
    }
  })

  it('down.sql removes the starting categories nothing uses', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.applyMigration(MIGRATION)
      db.exec(`INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","categoryOverride","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType")
          VALUES ('c_fake','acct_max',1900000000000,1900000000000,'עסק בדוי','עסק בדוי','','אופנה',10,10,'₪','0000','')`)
      db.applyDown(MIGRATION)
      expect(categories(db)).toEqual([{ name: 'אופנה', kind: 'EXPENSE' }])
      expect(db.query(`SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })
})
