import { describe, expect, it } from 'vitest'
import { createTestDb } from './test-db'

// Card rows stored before imports applied a merchant rule's category. Made-up rows only.

const MIGRATION = '20261022020000_backfill_rule_categories'

describe(`${MIGRATION} migration`, () => {
  it("gives rows without a category of their own their provider's rule category", () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
          ('acct_fake_cal','CREDIT_CARD','cal','Fake card',1900000000000);
        INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName","categoryOverride") VALUES
          ('r1','cal','FAKE CAFE','Fake Cafe','Coffee'),
          ('r2','cal','FAKE STREAMING','Fake Streaming',NULL),
          ('r3','max','FAKE GYM','Fake Gym','Sport');
        INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","categoryOverride","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType") VALUES
          ('t1','acct_fake_cal',1700000000000,1702000000000,'FAKE CAFE','Fake Cafe','',NULL,1,1,'ILS','','regular'),
          ('t2','acct_fake_cal',1700000000000,1702000000000,'FAKE CAFE','Fake Cafe','','Treats',1,1,'ILS','','regular'),
          ('t3','acct_fake_cal',1700000000000,1702000000000,'FAKE STREAMING','Fake Streaming','',NULL,1,1,'ILS','','regular'),
          ('t4','acct_fake_cal',1700000000000,1702000000000,'FAKE GYM','FAKE GYM','',NULL,1,1,'ILS','','regular');`)

      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT id, categoryOverride FROM "CreditCardTransaction" ORDER BY id`)).toEqual([
        { id: 't1', categoryOverride: 'Coffee' },
        // A category set on the row stays
        { id: 't2', categoryOverride: 'Treats' },
        // A rule without a category sets none
        { id: 't3', categoryOverride: null },
        // Another provider's rule does not apply
        { id: 't4', categoryOverride: null },
      ])
    } finally {
      db.cleanup()
    }
  })
})
