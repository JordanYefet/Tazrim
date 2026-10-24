import { describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './test-db'

// A new database starts with no accounts. Made-up rows only.

const MIGRATION = '20261025010000_no_default_accounts'

const accountIds = (db: TestDb) => db.query<{ id: string }>(`SELECT id FROM "Account" ORDER BY id`).map(a => a.id)

describe(`${MIGRATION} migration`, () => {
  it('a new database has no accounts', () => {
    const db = createTestDb({ defaultAccounts: false })
    try {
      expect(accountIds(db)).toEqual([])
    } finally {
      db.cleanup()
    }
  })

  it('removes only the untouched default accounts that nothing uses, and down.sql puts them back', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      expect(accountIds(db)).toEqual(['acct_leumi', 'acct_max'])
      db.applyMigration(MIGRATION)
      expect(accountIds(db)).toEqual([])
      db.applyDown(MIGRATION)
      expect(accountIds(db)).toEqual(['acct_leumi', 'acct_max'])
      expect(db.query(`SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })

  it('keeps a default account with rows, an upload or an import profile', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType")
          VALUES ('c_fake','acct_max',1900000000000,1900000000000,'עסק בדוי','עסק בדוי','',10,10,'₪','0000','');
        INSERT INTO "ImportProfile" ("id","name","accountKind","provider","mapping","headerSignature","accountId","updatedAt")
          VALUES ('p_fake','פרופיל בדוי','BANK','leumi','{}','sig',  'acct_leumi', 1900000000000);`)
      db.applyMigration(MIGRATION)
      expect(accountIds(db)).toEqual(['acct_leumi', 'acct_max'])
    } finally {
      db.cleanup()
    }
  })

  it('keeps a default account the user set up, even without data', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`UPDATE "Account" SET "displayName" = 'הבנק שלי' WHERE id = 'acct_leumi';
        UPDATE "Account" SET "cardLastFour" = '0000' WHERE id = 'acct_max';`)
      db.applyMigration(MIGRATION)
      expect(accountIds(db)).toEqual(['acct_leumi', 'acct_max'])
    } finally {
      db.cleanup()
    }
  })
})
