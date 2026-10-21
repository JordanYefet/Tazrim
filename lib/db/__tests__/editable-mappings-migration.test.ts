import { describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './test-db'

// ENG-69: ImportProfile.headers and Account.customImport. Made-up rows only.

const MIGRATION = '20261021010000_editable_mappings'

const columnsOf = (db: TestDb, table: string) =>
  db.query<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
    `SELECT name, type, "notnull", dflt_value FROM pragma_table_info('${table}') ORDER BY cid`
  )

describe(`${MIGRATION} migration`, () => {
  it('adds the columns with safe defaults, and down.sql removes them with the rows intact', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
          ('acct_fake_bank','BANK','otherbank','Fake bank',1900000000000);
        INSERT INTO "ImportProfile" ("id","name","accountKind","provider","mapping","headerSignature","accountId","updatedAt") VALUES
          ('prof_fake','Fake mapping','BANK','otherbank','{}','תאריך|תיאור|סכום','acct_fake_bank',1900000000000);`)
      const before = { account: columnsOf(db, 'Account'), profile: columnsOf(db, 'ImportProfile') }
      const rowsBefore = {
        account: db.query(`SELECT * FROM "Account" ORDER BY id`),
        profile: db.query(`SELECT * FROM "ImportProfile" ORDER BY id`),
      }
      const migrationsBefore = db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)

      db.applyMigration(MIGRATION)
      expect(columnsOf(db, 'ImportProfile')).toContainEqual({ name: 'headers', type: 'TEXT', notnull: 0, dflt_value: null })
      expect(columnsOf(db, 'Account')).toContainEqual({ name: 'customImport', type: 'BOOLEAN', notnull: 1, dflt_value: 'false' })
      // Every existing account keeps its built-in importer; old profiles have no stored header
      expect(db.query(`SELECT DISTINCT customImport FROM "Account"`)).toEqual([{ customImport: 0 }])
      expect(db.query(`SELECT headers FROM "ImportProfile"`)).toEqual([{ headers: null }])
      db.exec(`UPDATE "Account" SET "customImport" = true WHERE id = 'acct_leumi';
        UPDATE "ImportProfile" SET "headers" = '{"v":1,"header":["תאריך"],"samples":[]}';`)

      db.applyDown(MIGRATION)
      expect(columnsOf(db, 'Account')).toEqual(before.account)
      expect(columnsOf(db, 'ImportProfile')).toEqual(before.profile)
      expect(db.query(`SELECT * FROM "Account" ORDER BY id`)).toEqual(rowsBefore.account)
      expect(db.query(`SELECT * FROM "ImportProfile" ORDER BY id`)).toEqual(rowsBefore.profile)
      expect(db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)).toEqual(migrationsBefore)

      // and up again on the reverted DB
      db.applyMigration(MIGRATION)
      expect(columnsOf(db, 'Account').map(c => c.name)).toContain('customImport')
    } finally {
      db.cleanup()
    }
  })
})
