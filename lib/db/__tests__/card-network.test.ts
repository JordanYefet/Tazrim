import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// ENG-56: Account.cardNetwork. Made-up accounts only.

const MIGRATION = '20261019000000_card_network'

function columnsOf(db: TestDb) {
  return db.query<{ name: string; type: string; notnull: number }>(
    `SELECT name, type, "notnull" FROM pragma_table_info('Account') ORDER BY cid`
  )
}

describe(`${MIGRATION} migration`, () => {
  it('adds a nullable cardNetwork column, and down.sql removes it with the rows intact', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","cardLastFour","createdAt") VALUES
        ('acct_fake_card','CREDIT_CARD','cal','Fake card','0000',1900000000000);`)
      const columnsBefore = columnsOf(db)
      const rowsBefore = db.query(`SELECT * FROM "Account" ORDER BY id`)
      const migrationsBefore = db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)

      db.applyMigration(MIGRATION)
      expect(columnsOf(db)).toContainEqual({ name: 'cardNetwork', type: 'TEXT', notnull: 0 })
      // Existing accounts get NULL (unknown network)
      expect(db.query(`SELECT id, cardNetwork FROM "Account" ORDER BY id`)).toEqual(
        rowsBefore.map(r => ({ id: (r as { id: string }).id, cardNetwork: null }))
      )
      db.exec(`UPDATE "Account" SET "cardNetwork" = 'visa' WHERE id = 'acct_fake_card';`)

      db.applyDown(MIGRATION)
      expect(columnsOf(db)).toEqual(columnsBefore)
      expect(db.query(`SELECT * FROM "Account" ORDER BY id`)).toEqual(rowsBefore)
      expect(db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)).toEqual(
        migrationsBefore
      )
    } finally {
      db.cleanup()
    }
  })
})

describe('card network on accounts', () => {
  let db: TestDb
  let accounts: typeof import('../accounts')

  beforeAll(async () => {
    db = createTestDb()
    usePrismaOn(db)
    accounts = await import('../accounts')
  })

  afterAll(async () => {
    await releasePrisma()
    db.cleanup()
  })

  it('stores a network on a new card, case-insensitive', async () => {
    const a = await accounts.createAccount({ kind: 'CREDIT_CARD', provider: 'cal', displayName: 'Fake', cardNetwork: ' VISA ' })
    expect(a.cardNetwork).toBe('visa')
  })

  it.each([undefined, null, '', 'other'])('treats %o as no network', async value => {
    const a = await accounts.createAccount({ kind: 'CREDIT_CARD', provider: 'cal', displayName: 'Fake', cardNetwork: value })
    expect(a.cardNetwork).toBeNull()
  })

  it.each([
    [{ kind: 'CREDIT_CARD', provider: 'cal', displayName: 'n', cardNetwork: 'discover' }],
    [{ kind: 'CREDIT_CARD', provider: 'cal', displayName: 'n', cardNetwork: 7 }],
    [{ kind: 'BANK', provider: 'leumi', displayName: 'n', cardNetwork: 'visa' }],
  ])('rejects %o', async input => {
    await expect(accounts.createAccount(input)).rejects.toMatchObject({ field: 'cardNetwork' })
  })

  it('setCardNetwork sets and clears, and refuses bank accounts', async () => {
    expect((await accounts.setCardNetwork('acct_max', 'mastercard'))?.cardNetwork).toBe('mastercard')
    expect((await accounts.setCardNetwork('acct_max', null))?.cardNetwork).toBeNull()
    await expect(accounts.setCardNetwork('acct_leumi', 'visa')).rejects.toMatchObject({ field: 'cardNetwork' })
    expect(await accounts.setCardNetwork('acct_nope', 'visa')).toBeNull()
  })
})
