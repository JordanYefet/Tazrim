import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

type AccountsModule = typeof import('../accounts')

let db: TestDb
let accounts: AccountsModule

beforeAll(async () => {
  db = createTestDb()
  // Made-up extra accounts next to the two the migration seeds (created 2026-10-13)
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","cardLastFour","archived","createdAt") VALUES
    ('acct_test_old_card', 'CREDIT_CARD', 'max', 'Old test card', '1234', true, 1600000000000),
    ('acct_test_new_card', 'CREDIT_CARD', 'max', 'New test card', NULL, false, 1900000000000),
    ('acct_test_other_bank', 'BANK', 'otherbank', 'Other test bank', NULL, false, 1900000000000);`)
  usePrismaOn(db)
  accounts = await import('../accounts')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('listAccounts', () => {
  it('lists non-archived accounts, oldest first', async () => {
    const ids = (await accounts.listAccounts()).map(a => a.id)
    expect(ids).toEqual(['acct_leumi', 'acct_max', 'acct_test_new_card', 'acct_test_other_bank'])
  })

  it('filters by kind', async () => {
    const ids = (await accounts.listAccounts({ kind: 'BANK' })).map(a => a.id)
    expect(ids).toEqual(['acct_leumi', 'acct_test_other_bank'])
  })

  it('filters by provider', async () => {
    const ids = (await accounts.listAccounts({ provider: 'max' })).map(a => a.id)
    expect(ids).toEqual(['acct_max', 'acct_test_new_card'])
  })

  it('includes archived accounts on request', async () => {
    const ids = (await accounts.listAccounts({ kind: 'CREDIT_CARD', includeArchived: true })).map(a => a.id)
    expect(ids).toEqual(['acct_test_old_card', 'acct_max', 'acct_test_new_card'])
  })

  it('listAccountIds returns just the ids', async () => {
    expect(await accounts.listAccountIds({ kind: 'CREDIT_CARD', provider: 'max', includeArchived: true })).toEqual([
      'acct_test_old_card',
      'acct_max',
      'acct_test_new_card',
    ])
  })
})

describe('getAccount', () => {
  it('returns the account by id', async () => {
    const a = await accounts.getAccount('acct_test_old_card')
    expect(a).toMatchObject({ kind: 'CREDIT_CARD', provider: 'max', cardLastFour: '1234', archived: true })
  })

  it('returns null for an unknown id', async () => {
    expect(await accounts.getAccount('nope')).toBeNull()
  })
})

describe('getDefaultAccount', () => {
  it('is the oldest non-archived account of the kind', async () => {
    expect((await accounts.getDefaultAccount('CREDIT_CARD'))?.id).toBe('acct_max')
    expect((await accounts.getDefaultAccount('BANK'))?.id).toBe('acct_leumi')
  })

  it('can be narrowed to a provider', async () => {
    expect((await accounts.getDefaultAccount('BANK', 'otherbank'))?.id).toBe('acct_test_other_bank')
  })

  it('is null when no account matches', async () => {
    expect(await accounts.getDefaultAccount('PENSION')).toBeNull()
    expect(await accounts.getDefaultAccount('BANK', 'max')).toBeNull()
  })
})

describe('accountWhere', () => {
  it('maps an account filter to a Prisma where clause', () => {
    expect(accounts.accountWhere(undefined)).toEqual({})
    expect(accounts.accountWhere('acct_x')).toEqual({ accountId: 'acct_x' })
    expect(accounts.accountWhere(['acct_x', 'acct_y'])).toEqual({ accountId: { in: ['acct_x', 'acct_y'] } })
    expect(accounts.accountWhere([])).toEqual({ accountId: { in: [] } })
  })
})
