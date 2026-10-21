import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// ENG-66 / ENG-65: Account.color and editing every field. Made-up accounts only.

const MIGRATION = '20261021000000_account_color'

const columnsOf = (db: TestDb) =>
  db.query<{ name: string; type: string; notnull: number }>(`SELECT name, type, "notnull" FROM pragma_table_info('Account') ORDER BY cid`)

describe(`${MIGRATION} migration`, () => {
  it('adds a nullable color column, and down.sql removes it with the rows intact', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
        ('acct_fake_card','CREDIT_CARD','cal','Fake card',1900000000000);`)
      const columnsBefore = columnsOf(db)
      const rowsBefore = db.query(`SELECT * FROM "Account" ORDER BY id`)
      const migrationsBefore = db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)

      db.applyMigration(MIGRATION)
      expect(columnsOf(db)).toContainEqual({ name: 'color', type: 'TEXT', notnull: 0 })
      // Existing accounts keep their brand default
      expect(db.query(`SELECT DISTINCT color FROM "Account"`)).toEqual([{ color: null }])
      db.exec(`UPDATE "Account" SET "color" = 'glass' WHERE id = 'acct_fake_card';`)

      db.applyDown(MIGRATION)
      expect(columnsOf(db)).toEqual(columnsBefore)
      expect(db.query(`SELECT * FROM "Account" ORDER BY id`)).toEqual(rowsBefore)
      expect(db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)).toEqual(migrationsBefore)
    } finally {
      db.cleanup()
    }
  })
})

describe('accounts with a colour', () => {
  let db: TestDb
  let accounts: typeof import('../accounts')

  beforeAll(async () => {
    db = createTestDb()
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
        ('acct_fake_cal','CREDIT_CARD','cal','Fake cal card',1900000000000);
      INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType") VALUES
        ('t1','acct_fake_cal',1893456000000,1893456000000,'Fake Shop','Fake Shop','cat',7,7,'ILS','','regular');
      INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName") VALUES ('al1','cal','Fake Shop','Fake shop renamed');`)
    usePrismaOn(db)
    accounts = await import('../accounts')
  })
  afterAll(async () => {
    await releasePrisma()
    db.cleanup()
  })

  it('createAccount stores a valid colour and refuses a bad one', async () => {
    const a = await accounts.createAccount({ kind: 'BANK', provider: 'leumi', displayName: 'Fake bank', color: '#ABC' })
    expect(a.color).toBe('#aabbcc')
    const d = await accounts.createAccount({ kind: 'BANK', provider: 'leumi', displayName: 'Fake bank 2' })
    expect(d.color).toBeNull()
    await expect(accounts.createAccount({ kind: 'BANK', provider: 'leumi', displayName: 'x', color: 'nope' })).rejects.toMatchObject({ field: 'color' })
  })

  it('updateAccount edits every field at once, validating all before writing', async () => {
    const res = await accounts.updateAccount('acct_fake_cal', {
      displayName: ' New fake name ',
      cardLastFour: '0000',
      cardNetwork: 'visa',
      color: 'glass',
    })
    expect(res).toMatchObject({ status: 'updated', account: { displayName: 'New fake name', cardLastFour: '0000', cardNetwork: 'visa', color: 'glass' } })

    await expect(accounts.updateAccount('acct_fake_cal', { displayName: 'Not saved', cardLastFour: '12' })).rejects.toMatchObject({ field: 'cardLastFour' })
    expect(db.query(`SELECT displayName FROM "Account" WHERE id = 'acct_fake_cal'`)).toEqual([{ displayName: 'New fake name' }])

    // Back to the brand default, and clear the digits
    expect(await accounts.updateAccount('acct_fake_cal', { color: null, cardLastFour: '' })).toMatchObject({ account: { color: null, cardLastFour: null } })
  })

  it('a provider change on an account with transactions needs confirmation', async () => {
    expect(await accounts.updateAccount('acct_fake_cal', { provider: 'isracard' })).toEqual({
      status: 'provider_change_unconfirmed',
      from: 'cal',
      to: 'isracard',
      transactionCount: 1,
      ruleCount: 1,
    })
    expect(db.query(`SELECT provider FROM "Account" WHERE id = 'acct_fake_cal'`)).toEqual([{ provider: 'cal' }])
    expect(await accounts.updateAccount('acct_fake_cal', { provider: 'isracard', confirmProviderChange: true })).toMatchObject({
      status: 'updated',
      account: { provider: 'isracard' },
    })
    // The same provider again is no change, so no confirmation
    expect((await accounts.updateAccount('acct_fake_cal', { provider: 'isracard' })).status).toBe('updated')
  })

  it('bank accounts: no card fields, provider change without rows needs no confirmation', async () => {
    const bank = await accounts.createAccount({ kind: 'BANK', provider: 'hapoalim', displayName: 'Fake empty bank' })
    expect(await accounts.updateAccount(bank.id, { provider: 'discount', color: 'teal' })).toMatchObject({
      status: 'updated',
      account: { provider: 'discount', color: 'teal' },
    })
    await expect(accounts.updateAccount(bank.id, { cardLastFour: '1111' })).rejects.toMatchObject({ field: 'cardLastFour' })
    await expect(accounts.updateAccount(bank.id, { cardNetwork: 'visa' })).rejects.toMatchObject({ field: 'cardNetwork' })
  })

  it('nothing to update / not found', async () => {
    expect(await accounts.updateAccount('acct_fake_cal', {})).toEqual({ status: 'nothing_to_update' })
    expect(await accounts.updateAccount('acct_nope', { color: 'blue' })).toEqual({ status: 'not_found' })
  })
})
