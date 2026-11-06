import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestDb } from './test-db'
import { PROVIDER_ALIASES } from '@/lib/accounts/brands'
import { SYNC_COMPANIES } from '@/lib/sync/providers'

// Made-up accounts and rules only.

const MIGRATION = '20261106120000_issuer_providers'
const SQL = fs.readFileSync(path.join(__dirname, '../../../prisma/migrations', MIGRATION, 'migration.sql'), 'utf8')

describe(`${MIGRATION} migration`, () => {
  it('moves free-text and club providers to the company key, with their rules', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
          ('a_club','CREDIT_CARD','hitech','Fake club card',1900000000000),
          ('a_cal','CREDIT_CARD','cal','Fake card',1900000000001),
          ('a_heb','BANK','בנק לאומי','Fake bank',1900000000002),
          ('a_other','CREDIT_CARD','diners','Fake other card',1900000000003);
        INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName","categoryOverride") VALUES
          ('r1','hitech','FAKE CAFE','Club Cafe',NULL),
          ('r2','cal','FAKE CAFE','Cal Cafe','Coffee'),
          ('r3','hitech','FAKE GYM','Fake Gym','Sport'),
          ('r4','diners','FAKE SHOP','Fake Shop',NULL);
        INSERT INTO "CategoryMapping" ("id","provider","sourceCategory","category") VALUES
          ('m1','hitech','Fake source','Food');
        INSERT INTO "BankCategoryRule" ("id","provider","originalDescription","direction","category") VALUES
          ('b1','בנק לאומי','FAKE SALARY','IN','Salary');
        INSERT INTO "ImportProfile" ("id","name","accountKind","provider","mapping","headerSignature","createdAt","updatedAt") VALUES
          ('p1','Fake profile','CREDIT_CARD','hitech','{}','sig',1900000000000,1900000000000);`)

      db.applyMigration(MIGRATION)

      expect(db.query(`SELECT id, provider FROM "Account" ORDER BY id`)).toEqual([
        { id: 'a_cal', provider: 'cal' },
        { id: 'a_club', provider: 'cal' },
        { id: 'a_heb', provider: 'leumi' },
        // Unknown to the sync: stays, upload only
        { id: 'a_other', provider: 'diners' },
      ])
      expect(db.query(`SELECT id, provider, displayName FROM "TransactionAlias" ORDER BY id`)).toEqual([
        // The company's own rule wins a clash; the club's copy is dropped
        { id: 'r2', provider: 'cal', displayName: 'Cal Cafe' },
        { id: 'r3', provider: 'cal', displayName: 'Fake Gym' },
        { id: 'r4', provider: 'diners', displayName: 'Fake Shop' },
      ])
      expect(db.query(`SELECT provider FROM "CategoryMapping"`)).toEqual([{ provider: 'cal' }])
      expect(db.query(`SELECT provider FROM "BankCategoryRule"`)).toEqual([{ provider: 'leumi' }])
      expect(db.query(`SELECT provider FROM "ImportProfile"`)).toEqual([{ provider: 'cal' }])
    } finally {
      db.cleanup()
    }
  })

  it('maps the same names as PROVIDER_ALIASES, each to a sync company', () => {
    const pairs = [...SQL.matchAll(/\('([^']+)', '([a-z]+)'\)/g)].map(m => [m[1], m[2]])
    expect(Object.fromEntries(pairs)).toEqual(PROVIDER_ALIASES)
    const providers = new Set(SYNC_COMPANIES.map(c => c.provider))
    expect(pairs.filter(([, to]) => !providers.has(to))).toEqual([])
  })
})
