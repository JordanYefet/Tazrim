import { describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './test-db'

// Bank categories: Category.kind, BankTransaction.category/categoryManual, BankCategoryRule. Made-up rows only.

const MIGRATION = '20261023000000_bank_categories'

const columnsOf = (db: TestDb, table: string) =>
  db.query<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
    `SELECT name, type, "notnull", dflt_value FROM pragma_table_info('${table}') ORDER BY cid`
  )

describe(`${MIGRATION} migration`, () => {
  it('keeps existing categories as expense ones and bank rows uncategorized; down.sql restores the old tables', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Category" ("id","name") VALUES ('k1','Fake Food');
        INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","balance","sourceFile") VALUES
          ('b1','acct_leumi',1900000000000,'FAKE SHOP','FAKE SHOP',10,100,'fake.xlsx');`)
      const before = { bank: columnsOf(db, 'BankTransaction'), category: columnsOf(db, 'Category') }
      const rowsBefore = {
        bank: db.query(`SELECT * FROM "BankTransaction" ORDER BY id`),
        category: db.query(`SELECT * FROM "Category" ORDER BY id`),
      }

      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT name, kind FROM "Category"`)).toEqual([{ name: 'Fake Food', kind: 'EXPENSE' }])
      expect(db.query(`SELECT category, categoryManual FROM "BankTransaction"`)).toEqual([{ category: null, categoryManual: 0 }])
      db.exec(`INSERT INTO "BankCategoryRule" ("id","provider","originalDescription","direction","category") VALUES
        ('r1','leumi','FAKE SHOP','OUT','Fake Food');
        UPDATE "BankTransaction" SET category = 'Fake Food';`)
      // One rule per description, direction and provider
      expect(() =>
        db.exec(`INSERT INTO "BankCategoryRule" ("id","provider","originalDescription","direction","category") VALUES
          ('r2','leumi','FAKE SHOP','OUT','Other')`)
      ).toThrow()

      db.applyDown(MIGRATION)
      expect(columnsOf(db, 'BankTransaction')).toEqual(before.bank)
      expect(columnsOf(db, 'Category')).toEqual(before.category)
      expect(db.query(`SELECT * FROM "BankTransaction" ORDER BY id`)).toEqual(rowsBefore.bank)
      expect(db.query(`SELECT * FROM "Category" ORDER BY id`)).toEqual(rowsBefore.category)
      expect(db.query(`SELECT name FROM sqlite_master WHERE name = 'BankCategoryRule'`)).toEqual([])
      expect(db.query(`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([])
    } finally {
      db.cleanup()
    }
  })
})
