import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// Network isolation (ENG-142): the proxy's per-provider lists follow the accounts. Made-up accounts only.
const changed = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/egress/household', () => ({ householdChanged: () => void changed.n++ }))

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
beforeEach(() => {
  changed.n = 0
})

describe('accounts tell the egress proxy when the household\'s providers may have changed', () => {
  it('creating, archiving, restoring, changing the provider of, and deleting an account', async () => {
    const a = await accounts.createAccount({ kind: 'CREDIT_CARD', provider: 'isracard', displayName: 'כרטיס בדוי', cardLastFour: '0042' })
    expect(changed.n).toBe(1)
    await accounts.setArchived(a.id, true)
    expect(changed.n).toBe(2)
    await accounts.setArchived(a.id, false)
    expect(changed.n).toBe(3)
    await accounts.updateAccount(a.id, { provider: 'max' })
    expect(changed.n).toBe(4)
    await accounts.updateAccount(a.id, { archived: true })
    expect(changed.n).toBe(5)
    // a second card, so this one is not the last of its kind
    await accounts.createAccount({ kind: 'CREDIT_CARD', provider: 'cal', displayName: 'כרטיס בדוי ב', cardLastFour: '0043' })
    expect(changed.n).toBe(6)
    expect((await accounts.deleteAccount(a.id)).status).toBe('deleted')
    expect(changed.n).toBe(7)
  })

  it('what cannot change the household does not tell it: a rename, a colour, a missing account', async () => {
    const a = await accounts.createAccount({ kind: 'BANK', provider: 'leumi', displayName: 'חשבון בדוי' })
    changed.n = 0
    await accounts.renameAccount(a.id, 'שם חדש')
    await accounts.updateAccount(a.id, { color: '#336699' })
    await accounts.setArchived('no-such-account', true)
    expect((await accounts.deleteAccount('no-such-account')).status).toBe('not_found')
    expect(changed.n).toBe(0)
  })
})
