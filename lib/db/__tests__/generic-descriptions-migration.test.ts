import { describe, expect, it } from 'vitest'
import { STARTING_GENERIC_DESCRIPTIONS } from '../starting-generic-descriptions'
import { createTestDb } from './test-db'

// The starting list of generic bank descriptions, and the rules and rule categories it
// clears. Made-up rows only.

const MIGRATION = '20261025030000_generic_descriptions'

describe(`${MIGRATION} migration`, () => {
  it('starts with the same list as lib/db/starting-generic-descriptions.ts', () => {
    const db = createTestDb()
    try {
      expect(db.query<{ description: string }>(`SELECT description FROM "GenericDescription" ORDER BY id`).map(r => r.description)).toEqual(
        STARTING_GENERIC_DESCRIPTIONS
      )
    } finally {
      db.cleanup()
    }
  })

  it("drops the starting descriptions' rules and the categories they set; manual rows and other descriptions stay", () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_fake_bank','BANK','leumi','Fake bank',1900000000000),
  ('acct_fake_other','BANK','otherbank','Other fake bank',1900000000000);
INSERT INTO "BankCategoryRule" ("id","provider","originalDescription","direction","category") VALUES
  ('r1','leumi','שיק','OUT','Fake Rent'),
  ('r2','otherbank','שיק','IN','Fake Salary'),
  ('r3','leumi','FAKE UTILITY','OUT','Fake Bills');
INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","credit","balance","category","categoryManual","sourceFile") VALUES
  ('t1','acct_fake_bank',1900000000000,'שיק','שיק',100,0,1000,'Fake Rent',false,'fake.xlsx'),
  ('t2','acct_fake_bank',1900086400000,'שיק','שיק',200,0,800,'Fake Food',true,'fake.xlsx'),
  ('t3','acct_fake_other',1900000000000,'שיק','שיק',0,300,1100,'Fake Salary',false,'fake.xlsx'),
  ('t4','acct_fake_bank',1900172800000,'FAKE UTILITY','FAKE UTILITY',50,0,750,'Fake Bills',false,'fake.xlsx');
`)
      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT id FROM "BankCategoryRule" ORDER BY id`)).toEqual([{ id: 'r3' }])
      expect(db.query(`SELECT id, category, categoryManual FROM "BankTransaction" ORDER BY id`)).toEqual([
        { id: 't1', category: null, categoryManual: 0 },
        { id: 't2', category: 'Fake Food', categoryManual: 1 },
        { id: 't3', category: null, categoryManual: 0 },
        { id: 't4', category: 'Fake Bills', categoryManual: 0 },
      ])
    } finally {
      db.cleanup()
    }
  })

  it('down.sql drops the list and its migration row', () => {
    const db = createTestDb()
    try {
      db.applyDown(MIGRATION)
      expect(db.query(`SELECT name FROM sqlite_master WHERE name = 'GenericDescription'`)).toEqual([])
      expect(db.query(`SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })
})
