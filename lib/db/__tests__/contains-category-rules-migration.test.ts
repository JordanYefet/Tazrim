import { describe, expect, it } from 'vitest'
import { createTestDb } from './test-db'

// Card charges stored before the hand-picked flag. Made-up rows only.

const MIGRATION = '20261031000000_contains_category_rules'

describe(`${MIGRATION} migration`, () => {
  it('marks as hand-picked the overrides no merchant rule of the provider explains', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
          ('acct_fake_max','CREDIT_CARD','max','Fake card',1900000000000),
          ('acct_fake_cal','CREDIT_CARD','cal','Other fake card',1900000000000);
        INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName","categoryOverride") VALUES
          ('r1','max','FAKE CAFE','Fake Cafe','Coffee'),
          ('r2','max','FAKE STREAMING','Fake Streaming',NULL);
        INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","categoryOverride","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType") VALUES
          ('t1','acct_fake_max',1700000000000,1702000000000,'FAKE CAFE','Fake Cafe','x','Coffee',1,1,'ILS','','regular'),
          ('t2','acct_fake_max',1700000000000,1702000000000,'FAKE CAFE','Fake Cafe','x','Treats',1,1,'ILS','','regular'),
          ('t3','acct_fake_max',1700000000000,1702000000000,'FAKE STREAMING','Fake Streaming','x','Fun',1,1,'ILS','','regular'),
          ('t4','acct_fake_max',1700000000000,1702000000000,'FAKE GYM','FAKE GYM','x',NULL,1,1,'ILS','','regular'),
          ('t5','acct_fake_cal',1700000000000,1702000000000,'FAKE CAFE','FAKE CAFE','x','Coffee',1,1,'ILS','','regular');`)

      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT id, categoryOverride, categoryManual FROM "CreditCardTransaction" ORDER BY id`)).toEqual([
        // The merchant rule's own category
        { id: 't1', categoryOverride: 'Coffee', categoryManual: 0 },
        // Another category than the rule's: picked on the row
        { id: 't2', categoryOverride: 'Treats', categoryManual: 1 },
        // The rule has no category
        { id: 't3', categoryOverride: 'Fun', categoryManual: 1 },
        // No override at all
        { id: 't4', categoryOverride: null, categoryManual: 0 },
        // Another provider's rule explains nothing
        { id: 't5', categoryOverride: 'Coffee', categoryManual: 1 },
      ])
      expect(db.query(`SELECT COUNT(*) AS n FROM "CategoryKeywordRule"`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })

  it('down.sql reverts it', () => {
    const db = createTestDb()
    try {
      db.applyDown(MIGRATION)
      expect(db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'CategoryKeywordRule'`)).toEqual([])
      const columns = db.query<{ name: string }>(`PRAGMA table_info("CreditCardTransaction")`).map(c => c.name)
      expect(columns).not.toContain('categoryManual')
    } finally {
      db.cleanup()
    }
  })
})
