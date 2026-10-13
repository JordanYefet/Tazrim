import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

let db: TestDb
let aliases: typeof import('../aliases')

beforeAll(async () => {
  db = createTestDb()
  // Made-up data: a second MAX card and a second (non-Leumi) bank next to the seeded accounts
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_test_max2', 'CREDIT_CARD', 'max', 'Second test card', 1900000000000),
  ('acct_test_bank2', 'BANK', 'otherbank', 'Other test bank', 1900000000000);
INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType") VALUES
  ('c1', 'acct_max', 1700000000000, 1702000000000, 'CAFE B', 'CAFE B', 'Food', 1, 1, 'ILS', '', 'regular'),
  ('c2', 'acct_test_max2', 1700000000000, 1702000000000, 'CAFE B', 'CAFE B', 'Food', 2, 2, 'ILS', '', 'regular');
INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","balance","sourceFile") VALUES
  ('b1', 'acct_leumi', 1700000000000, 'SHOP A', 'SHOP A', 1, 10, 'f.xls'),
  ('b2', 'acct_test_bank2', 1700000000000, 'SHOP A', 'SHOP A', 1, 10, 'f.xls');
INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName","categoryOverride") VALUES
  ('a1', 'max', 'STORE C', 'Store C', NULL),
  ('a2', 'leumi', 'STORE C', 'Store C (bank)', NULL);
`)
  usePrismaOn(db)
  aliases = await import('../aliases')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('normalizeProvider', () => {
  it('maps the legacy enum values to provider strings', () => {
    expect(aliases.normalizeProvider('BANK')).toBe('leumi')
    expect(aliases.normalizeProvider('MAX')).toBe('max')
    expect(aliases.normalizeProvider('HITECH')).toBe('hitech')
  })

  it('lower-cases and trims anything else', () => {
    expect(aliases.normalizeProvider(' Leumi ')).toBe('leumi')
    expect(aliases.normalizeProvider('max')).toBe('max')
    expect(aliases.normalizeProvider('SomeBank')).toBe('somebank')
  })
})

describe('provider-keyed alias lookup', () => {
  it('getAliases filters by provider', async () => {
    expect((await aliases.getAliases('max')).map(a => a.id)).toEqual(['a1'])
    expect((await aliases.getAliases('leumi')).map(a => a.id)).toEqual(['a2'])
    expect((await aliases.getAliases()).length).toBe(2)
  })

  it('getAliasMap maps original names to display names for one provider', async () => {
    expect(await aliases.getAliasMap('max')).toEqual(new Map([['STORE C', 'Store C']]))
    expect(await aliases.getAliasMap('leumi')).toEqual(new Map([['STORE C', 'Store C (bank)']]))
    expect(await aliases.getAliasMap('nobody')).toEqual(new Map())
  })

  it('upsertAlias creates then updates the rule of a provider', async () => {
    await aliases.upsertAlias({ provider: 'max', originalName: 'NEW D', displayName: 'New D' })
    await aliases.upsertAlias({ provider: 'max', originalName: 'NEW D', displayName: 'New D2' })
    expect((await aliases.getAliasMap('max')).get('NEW D')).toBe('New D2')
    expect((await aliases.getAliasMap('leumi')).has('NEW D')).toBe(false)
  })
})

describe('upsertAliasAndBulkUpdate', () => {
  it('applies a card rule to every account of that provider', async () => {
    await aliases.upsertAliasAndBulkUpdate({
      provider: 'max',
      originalName: 'CAFE B',
      displayName: 'Cafe B',
      categoryOverride: 'Coffee',
    })
    const rows = db.query(`SELECT id, categoryOverride FROM "CreditCardTransaction" ORDER BY id`)
    expect(rows).toEqual([
      { id: 'c1', categoryOverride: 'Coffee' },
      { id: 'c2', categoryOverride: 'Coffee' },
    ])
  })

  it('applies a bank rule only to accounts of that provider', async () => {
    await aliases.upsertAliasAndBulkUpdate({ provider: 'leumi', originalName: 'SHOP A', displayName: 'Shop A' })
    const rows = db.query(`SELECT id, description FROM "BankTransaction" ORDER BY id`)
    expect(rows).toEqual([
      { id: 'b1', description: 'Shop A' },
      { id: 'b2', description: 'SHOP A' },
    ])
  })
})
