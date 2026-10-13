import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// Made-up accounts, merchants, amounts and dates only (2030, never overlapping real data).

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

const count = (sql: string) => db.query<{ n: number }>(sql)[0].n

describe('validateNewAccount / createAccount', () => {
  it('creates a card with normalized fields', async () => {
    const a = await accounts.createAccount({
      kind: 'CREDIT_CARD',
      provider: '  Isracard ',
      displayName: '  כרטיס   בדוי ',
      cardLastFour: '0042',
    })
    expect(a).toMatchObject({
      kind: 'CREDIT_CARD',
      provider: 'isracard',
      displayName: 'כרטיס בדוי',
      cardLastFour: '0042',
      archived: false,
    })
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await accounts.listAccounts({ kind: 'CREDIT_CARD' })).map(x => x.id)).toContain(a.id)
  })

  it('creates a bank account without last-4, empty last-4 means none', async () => {
    const a = await accounts.createAccount({ kind: 'BANK', provider: 'leumi', displayName: 'Fake joint', cardLastFour: '' })
    expect(a).toMatchObject({ kind: 'BANK', provider: 'leumi', cardLastFour: null })
  })

  it.each([
    [{ kind: 'PENSION', provider: 'x', displayName: 'n' }, 'kind'],
    [{ kind: 'TRADING', provider: 'x', displayName: 'n' }, 'kind'],
    [{ kind: undefined, provider: 'x', displayName: 'n' }, 'kind'],
    [{ kind: 'BANK', provider: '', displayName: 'n' }, 'provider'],
    [{ kind: 'BANK', provider: '!!', displayName: 'n' }, 'provider'],
    [{ kind: 'BANK', provider: 'a'.repeat(41), displayName: 'n' }, 'provider'],
    [{ kind: 'BANK', provider: 'x', displayName: '   ' }, 'displayName'],
    [{ kind: 'BANK', provider: 'x', displayName: 'n'.repeat(61) }, 'displayName'],
    [{ kind: 'BANK', provider: 'x', displayName: 'n', cardLastFour: '1234' }, 'cardLastFour'],
    [{ kind: 'CREDIT_CARD', provider: 'x', displayName: 'n', cardLastFour: '123' }, 'cardLastFour'],
    [{ kind: 'CREDIT_CARD', provider: 'x', displayName: 'n', cardLastFour: '12345' }, 'cardLastFour'],
    [{ kind: 'CREDIT_CARD', provider: 'x', displayName: 'n', cardLastFour: '12a4' }, 'cardLastFour'],
    [{ kind: 'CREDIT_CARD', provider: 'x', displayName: 'n', cardLastFour: 1234 }, 'cardLastFour'],
  ])('rejects %o (%s)', async (input, field) => {
    const before = count(`SELECT COUNT(*) AS n FROM "Account"`)
    await expect(accounts.createAccount(input)).rejects.toMatchObject({ name: 'AccountValidationError', field })
    expect(count(`SELECT COUNT(*) AS n FROM "Account"`)).toBe(before)
  })
})

describe('renameAccount', () => {
  it('renames and trims', async () => {
    const a = await accounts.renameAccount('acct_max', '  שם חדש בדוי ')
    expect(a?.displayName).toBe('שם חדש בדוי')
    expect((await accounts.getAccount('acct_max'))?.displayName).toBe('שם חדש בדוי')
  })

  it('rejects an empty name and returns null for an unknown id', async () => {
    await expect(accounts.renameAccount('acct_max', ' ')).rejects.toMatchObject({ field: 'displayName' })
    expect(await accounts.renameAccount('acct_nope', 'x')).toBeNull()
  })
})

describe('setArchived', () => {
  it('archives (hidden from listAccounts, kept with includeArchived) and restores', async () => {
    const a = await accounts.createAccount({ kind: 'CREDIT_CARD', provider: 'max', displayName: 'Archive me' })
    expect((await accounts.setArchived(a.id, true))?.archived).toBe(true)
    expect((await accounts.listAccounts()).map(x => x.id)).not.toContain(a.id)
    expect((await accounts.listAccounts({ includeArchived: true })).map(x => x.id)).toContain(a.id)

    expect((await accounts.setArchived(a.id, false))?.archived).toBe(false)
    expect((await accounts.listAccounts()).map(x => x.id)).toContain(a.id)
  })

  it('returns null for an unknown id', async () => {
    expect(await accounts.setArchived('acct_nope', true)).toBeNull()
  })
})

describe('listAccountsWithCounts', () => {
  it('includes archived accounts and counts rows per account', async () => {
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","archived","createdAt") VALUES
      ('acct_cnt', 'BANK', 'otherbank', 'Counted', true, 1900000000000);
      INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","credit","balance","sourceFile") VALUES
      ('cnt1','acct_cnt',1893456000000,'Fake A','Fake A',1,0,10,'f.xls'),
      ('cnt2','acct_cnt',1893542400000,'Fake B','Fake B',2,0,8,'f.xls');
      INSERT INTO "UploadHistory" ("id","accountId","fileName","recordCount") VALUES ('cntu','acct_cnt','f.xls',2);`)
    const row = (await accounts.listAccountsWithCounts()).find(a => a.id === 'acct_cnt')
    expect(row).toMatchObject({
      archived: true,
      counts: { bankTransactions: 2, creditCardTransactions: 0, uploads: 1 },
      transactionCount: 2,
    })
  })
})

describe('deleteAccount', () => {
  /** Two card accounts with made-up rows, overrides and dismissals each. */
  function seedCards() {
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
      ('acct_del', 'CREDIT_CARD', 'max', 'Doomed card', 1900000000000),
      ('acct_keep', 'CREDIT_CARD', 'max', 'Kept card', 1900000000000),
      ('acct_del_bank', 'BANK', 'otherbank', 'Doomed bank', 1900000000000);
    INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType","sourceFile") VALUES
      ('del1','acct_del',1893456000000,1893456000000,'Fake Shop','Fake Shop','cat',11,11,'ILS','','regular','d.xlsx'),
      ('del2','acct_del',1893542400000,1893542400000,'Fake Gym','Fake Gym','cat',22,22,'ILS','','regular','d.xlsx'),
      ('del3','acct_del',1893628800000,1893628800000,'Fake Cafe','Fake Cafe','cat',33,33,'ILS','','regular','d2.xlsx'),
      ('keep1','acct_keep',1893456000000,1893456000000,'Fake Shop','Fake Shop','cat',11,11,'ILS','','regular','d.xlsx'),
      ('keep2','acct_max',1893456000000,1893456000000,'Fake Shop','Fake Shop','cat',11,11,'ILS','','regular','d.xlsx');
    INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","credit","balance","sourceFile") VALUES
      ('delb1','acct_del_bank',1893456000000,'Fake','Fake',5,0,10,'b.xls'),
      ('keepb1','acct_leumi',1893456000000,'Fake','Fake',5,0,10,'b.xls');
    INSERT INTO "UploadHistory" ("id","accountId","fileName","recordCount") VALUES
      ('u_del1','acct_del','d.xlsx',2), ('u_del2','acct_del','d2.xlsx',1),
      ('u_keep','acct_keep','d.xlsx',1), ('u_delb','acct_del_bank','b.xls',1);
    INSERT INTO "RecurringSeriesOverride" ("id","key","baseKey","accountId","status","updatedAt") VALUES
      ('o_del1','card|acct_del|fake gym|monthly','card|acct_del|fake gym','acct_del','CONFIRMED',1893456000000),
      ('o_del2','card|acct_del|fake shop|monthly','card|acct_del|fake shop',NULL,'DISMISSED',1893456000000),
      ('o_keep','card|acct_keep|fake gym|monthly','card|acct_keep|fake gym','acct_keep','CONFIRMED',1893456000000);
    INSERT INTO "UnusualDismissal" ("id","source","transactionId") VALUES
      ('ud_del','card','del1'), ('ud_keep','card','keep1'), ('ud_keepb','bank','keepb1'),
      ('ud_wrong_source','bank','del2');`)
  }

  const snapshot = () => ({
    accounts: db.query(`SELECT id FROM "Account" ORDER BY id`),
    cards: db.query(`SELECT id FROM "CreditCardTransaction" ORDER BY id`),
    bank: db.query(`SELECT id FROM "BankTransaction" ORDER BY id`),
    uploads: db.query(`SELECT id FROM "UploadHistory" ORDER BY id`),
    overrides: db.query(`SELECT id FROM "RecurringSeriesOverride" ORDER BY id`),
    dismissals: db.query(`SELECT id FROM "UnusualDismissal" ORDER BY id`),
  })

  beforeAll(() => seedCards())

  it('404s an unknown account', async () => {
    expect(await accounts.deleteAccount('acct_nope')).toEqual({ status: 'not_found' })
  })

  it('requires the typed display name when the account has transactions', async () => {
    const before = snapshot()
    expect(await accounts.deleteAccount('acct_del')).toEqual({ status: 'confirmation_required' })
    expect(await accounts.deleteAccount('acct_del', { confirmName: 'Kept card' })).toEqual({ status: 'confirmation_required' })
    expect(snapshot()).toEqual(before)
  })

  it('cascades to exactly its own rows, overrides and dismissals', async () => {
    const before = snapshot()
    const res = await accounts.deleteAccount('acct_del', { confirmName: ' Doomed card ' })
    expect(res).toEqual({
      status: 'deleted',
      deleted: { bankTransactions: 0, creditCardTransactions: 3, uploads: 2, recurringOverrides: 2, unusualDismissals: 1 },
    })
    const after = snapshot()
    const without = (rows: unknown[], ids: string[]) => rows.filter(r => !ids.includes((r as { id: string }).id))
    expect(after.accounts).toEqual(without(before.accounts, ['acct_del']))
    expect(after.cards).toEqual(without(before.cards, ['del1', 'del2', 'del3']))
    expect(after.bank).toEqual(before.bank)
    expect(after.uploads).toEqual(without(before.uploads, ['u_del1', 'u_del2']))
    expect(after.overrides).toEqual(without(before.overrides, ['o_del1', 'o_del2']))
    // a bank dismissal that happens to share an id with a deleted card row is not touched
    expect(after.dismissals).toEqual(without(before.dismissals, ['ud_del']))
  })

  it('deletes a bank account with its bank rows only', async () => {
    const res = await accounts.deleteAccount('acct_del_bank', { confirmName: 'Doomed bank' })
    expect(res).toMatchObject({ status: 'deleted', deleted: { bankTransactions: 1, creditCardTransactions: 0, uploads: 1 } })
    expect(db.query(`SELECT id FROM "BankTransaction" WHERE accountId = 'acct_leumi'`)).toEqual([{ id: 'keepb1' }])
  })

  it('deletes an empty account without confirmation', async () => {
    const a = await accounts.createAccount({ kind: 'CREDIT_CARD', provider: 'max', displayName: 'Empty' })
    expect(await accounts.deleteAccount(a.id)).toEqual({
      status: 'deleted',
      deleted: { bankTransactions: 0, creditCardTransactions: 0, uploads: 0, recurringOverrides: 0, unusualDismissals: 0 },
    })
    expect(await accounts.getAccount(a.id)).toBeNull()
  })

  it('never deletes the last account of a kind (archived ones count)', async () => {
    // Leave acct_leumi plus one archived bank account
    db.exec(`DELETE FROM "BankTransaction" WHERE accountId NOT IN ('acct_leumi');
      DELETE FROM "UploadHistory" WHERE accountId IN (SELECT id FROM "Account" WHERE kind = 'BANK' AND id <> 'acct_leumi');
      DELETE FROM "Account" WHERE kind = 'BANK' AND id <> 'acct_leumi';
      INSERT INTO "Account" ("id","kind","provider","displayName","archived","createdAt") VALUES
        ('acct_old_bank', 'BANK', 'leumi', 'Old', true, 1900000000000);`)
    expect(await accounts.deleteAccount('acct_old_bank')).toMatchObject({ status: 'deleted' })
    expect(await accounts.deleteAccount('acct_leumi', { confirmName: 'anything' })).toEqual({ status: 'last_of_kind' })
    expect(db.query(`SELECT id FROM "Account" WHERE kind = 'BANK'`)).toEqual([{ id: 'acct_leumi' }])
  })
})
