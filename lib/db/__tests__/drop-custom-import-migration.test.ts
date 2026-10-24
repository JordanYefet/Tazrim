import { describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './test-db'

// Every provider imports through a mapping: Account.customImport goes. Made-up rows only.

const MIGRATION = '20261024000000_drop_custom_import'

const columnNames = (db: TestDb, table: string) =>
  db.query<{ name: string }>(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).map(c => c.name)

describe(`${MIGRATION} migration`, () => {
  it('drops the column and keeps every account and saved mapping; down.sql adds it back', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","customImport","createdAt") VALUES
          ('acct_fake_max','CREDIT_CARD','max','Fake card',true,1900000000000);
        INSERT INTO "ImportProfile" ("id","name","accountKind","provider","mapping","headerSignature","accountId","updatedAt") VALUES
          ('prof_fake','Fake mapping','CREDIT_CARD','max','{}','תאריך עסקה|שם בית העסק','acct_fake_max',1900000000000);`)
      const accounts = db.query(`SELECT id, kind, provider, displayName FROM "Account" ORDER BY id`)
      const profiles = db.query(`SELECT * FROM "ImportProfile" ORDER BY id`)

      db.applyMigration(MIGRATION)
      expect(columnNames(db, 'Account')).not.toContain('customImport')
      expect(db.query(`SELECT id, kind, provider, displayName FROM "Account" ORDER BY id`)).toEqual(accounts)
      expect(db.query(`SELECT * FROM "ImportProfile" ORDER BY id`)).toEqual(profiles)

      db.applyDown(MIGRATION)
      expect(columnNames(db, 'Account')).toContain('customImport')
      expect(db.query(`SELECT DISTINCT customImport FROM "Account"`)).toEqual([{ customImport: 0 }])
      expect(db.query(`SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })
})
