import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ParsedCCTransaction } from '../../parsers/types'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// Issuer categories mapped to yours (ENG-75). Made-up merchants and categories only.

const MIGRATION = '20261025000000_category_mapping'

describe(`${MIGRATION} migration`, () => {
  it("keeps each row's category as the issuer's, and down.sql gives the issuer's back", () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType")
          VALUES ('c_food','acct_max',1900000000000,1900000000000,'עסק בדוי','עסק בדוי','מזון בדוי',10,10,'₪','0000',''),
                 ('c_none','acct_max',1900000000000,1900000000000,'עסק בדוי 2','עסק בדוי 2','',10,10,'₪','0000','');`)
      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT id, category, sourceCategory FROM "CreditCardTransaction" ORDER BY id`)).toEqual([
        { id: 'c_food', category: 'מזון בדוי', sourceCategory: 'מזון בדוי' },
        { id: 'c_none', category: '', sourceCategory: '' },
      ])

      // A mapping made after the migration is undone by down.sql
      db.exec(`INSERT INTO "CategoryMapping" ("id","provider","sourceCategory","category") VALUES ('m1','max','מזון בדוי','סופר בדוי');
        UPDATE "CreditCardTransaction" SET "category" = 'סופר בדוי' WHERE id = 'c_food';`)
      db.applyDown(MIGRATION)
      expect(db.query(`SELECT id, category FROM "CreditCardTransaction" ORDER BY id`)).toEqual([
        { id: 'c_food', category: 'מזון בדוי' },
        { id: 'c_none', category: '' },
      ])
      expect(db.query(`SELECT name FROM sqlite_master WHERE name = 'CategoryMapping'`)).toEqual([])
      expect(db.query(`SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION}'`)).toEqual([{ n: 0 }])
    } finally {
      db.cleanup()
    }
  })
})

describe('category mappings', () => {
  let db: TestDb
  let mappings: typeof import('../category-mappings')
  let cards: typeof import('../cards')

  const row = (merchant: string, category: string, day: number): ParsedCCTransaction => ({
    transactionDate: new Date(2030, 0, day),
    billingDate: new Date(2030, 1, 10),
    originalMerchantName: merchant,
    merchantName: merchant,
    category,
    chargedAmount: 10 + day,
    originalAmount: 10 + day,
    originalCurrency: '₪',
    cardLastFour: '0000',
    transactionType: 'רגילה',
    notes: '',
    cardProvider: 'MAPPED',
  })

  const categoryOf = (merchant: string) =>
    db.query<{ category: string; sourceCategory: string; categoryOverride: string | null }>(
      `SELECT category, sourceCategory, categoryOverride FROM "CreditCardTransaction" WHERE originalMerchantName = '${merchant}'`
    )

  beforeAll(async () => {
    db = createTestDb()
    // A second provider whose files use the same category name
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES ('acct_test_other', 'CREDIT_CARD', 'othercard', 'Other test card', 1900000000000);
      INSERT INTO "Category" ("id","name","kind") VALUES ('k1','סופר בדוי','EXPENSE'), ('k2','מסעדות בדויות','EXPENSE');`)
    usePrismaOn(db)
    mappings = await import('../category-mappings')
    cards = await import('../cards')
  })

  afterAll(async () => {
    await releasePrisma()
    db.cleanup()
  })

  it('an unmapped issuer category keeps its own name on import', async () => {
    await cards.upsertCCTransactions([row('MERCHANT A', 'מזון בדוי', 1)], 'a.xlsx', 'acct_max')
    expect(categoryOf('MERCHANT A')).toEqual([{ category: 'מזון בדוי', sourceCategory: 'מזון בדוי', categoryOverride: null }])
  })

  it("saving a mapping updates that provider's stored rows only", async () => {
    await cards.upsertCCTransactions([row('MERCHANT B', 'מזון בדוי', 2)], 'b.xlsx', 'acct_test_other')
    await mappings.saveCategoryMapping({ provider: 'max', sourceCategory: 'מזון בדוי', category: 'סופר בדוי' })
    expect(categoryOf('MERCHANT A')[0]).toMatchObject({ category: 'סופר בדוי', sourceCategory: 'מזון בדוי' })
    expect(categoryOf('MERCHANT B')[0]).toMatchObject({ category: 'מזון בדוי' })
  })

  it('a mapped issuer category gets your category on import', async () => {
    await cards.upsertCCTransactions([row('MERCHANT C', 'מזון בדוי', 3)], 'c.xlsx', 'acct_max')
    expect(categoryOf('MERCHANT C')).toEqual([{ category: 'סופר בדוי', sourceCategory: 'מזון בדוי', categoryOverride: null }])
  })

  it('a category set by hand still wins over a mapping', async () => {
    db.exec(`UPDATE "CreditCardTransaction" SET "categoryOverride" = 'מסעדות בדויות' WHERE originalMerchantName = 'MERCHANT C'`)
    await mappings.saveCategoryMapping({ provider: 'max', sourceCategory: 'מזון בדוי', category: 'מסעדות בדויות' })
    await mappings.saveCategoryMapping({ provider: 'max', sourceCategory: 'מזון בדוי', category: 'סופר בדוי' })
    expect(categoryOf('MERCHANT C')[0].categoryOverride).toBe('מסעדות בדויות')
  })

  it('lists the issuer categories on stored rows with their mapping', async () => {
    expect(await mappings.getIssuerCategories()).toEqual([
      { provider: 'max', sourceCategory: 'מזון בדוי', count: 2, category: 'סופר בדוי' },
      { provider: 'othercard', sourceCategory: 'מזון בדוי', count: 1, category: null },
    ])
  })

  it("removing a mapping (or mapping to its own name) gives the rows the issuer's name back", async () => {
    await mappings.removeCategoryMapping('max', 'מזון בדוי')
    expect(categoryOf('MERCHANT A')[0].category).toBe('מזון בדוי')
    expect(await mappings.getCategoryMap('max')).toEqual(new Map())

    await mappings.saveCategoryMapping({ provider: 'max', sourceCategory: 'מזון בדוי', category: 'סופר בדוי' })
    await mappings.saveCategoryMapping({ provider: 'max', sourceCategory: 'מזון בדוי', category: 'מזון בדוי' })
    expect(categoryOf('MERCHANT A')[0].category).toBe('מזון בדוי')
    expect(await mappings.getCategoryMap('max')).toEqual(new Map())
  })
})
