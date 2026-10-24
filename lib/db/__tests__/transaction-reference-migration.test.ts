import { describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './test-db'

// Transaction reference and charged currency. Made-up rows only.

const MIGRATION = '20261024010000_transaction_reference'

const columnNames = (db: TestDb, table: string) =>
  db.query<{ name: string }>(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).map(c => c.name)

describe(`${MIGRATION} migration`, () => {
  it('adds the columns with defaults for existing rows, and down.sql removes them', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType")
          VALUES ('c_fake','acct_max',1900000000000,1900000000000,'עסק בדוי','עסק בדוי','',10,10,'₪','0000','');
        INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","credit","balance","sourceFile")
          VALUES ('b_fake','acct_leumi',1900000000000,'העברה בדויה','העברה בדויה',5,0,100,'fake.xls');`)
      const card = columnNames(db, 'CreditCardTransaction')
      const bank = columnNames(db, 'BankTransaction')

      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT chargedCurrency, reference FROM "CreditCardTransaction"`)).toEqual([{ chargedCurrency: '₪', reference: '' }])
      expect(db.query(`SELECT reference FROM "BankTransaction"`)).toEqual([{ reference: '' }])

      db.applyDown(MIGRATION)
      expect(columnNames(db, 'CreditCardTransaction')).toEqual(card)
      expect(columnNames(db, 'BankTransaction')).toEqual(bank)
      expect(db.query(`SELECT COUNT(*) AS n FROM "CreditCardTransaction"`)).toEqual([{ n: 1 }])
      expect(db.query(`SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })
})
