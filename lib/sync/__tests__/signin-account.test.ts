import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '../../db/__tests__/test-db'

// The account chosen on a saved sign-in ("לחשבון") decides where the first sync's
// found accounts go, instead of asking. The made-up site (TAZRIM_FAKE_SYNC) finds one
// Leumi account and two MAX cards (1234, 5678). Made-up accounts and digits only.
let db: TestDb
let runs: typeof import('../runs')
let providers: typeof import('../providers')
let prisma: typeof import('../../db/client')['prisma']

beforeAll(async () => {
  process.env.TAZRIM_FAKE_SYNC = '1'
  db = createTestDb()
  // A second Leumi account, so the bank's found account can't be guessed without the sign-in
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","cardLastFour","archived","createdAt") VALUES
    ('a_leumi2','BANK','leumi','Fake joint account',NULL,false,1900000000001),
    ('a_max2','CREDIT_CARD','max','Fake second card',NULL,false,1900000000002);`)
  usePrismaOn(db)
  runs = await import('../runs')
  providers = await import('../providers')
  prisma = (await import('../../db/client')).prisma
})

beforeEach(async () => {
  runs.resetRuns()
  await prisma.syncLink.deleteMany()
  await prisma.bankCredential.deleteMany()
  await prisma.bankTransaction.deleteMany()
  await prisma.creditCardTransaction.deleteMany()
  await prisma.account.update({ where: { id: 'acct_max' }, data: { cardLastFour: null } })
  await prisma.account.update({ where: { id: 'a_max2' }, data: { cardLastFour: null } })
})

afterAll(async () => {
  runs.resetRuns()
  await releasePrisma()
  db.cleanup()
  delete process.env.TAZRIM_FAKE_SYNC
})

const start = () => new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)

/** A saved sign-in naming an account; its sealed fields are never opened here */
const signIn = (company: string, accountId: string | null, createdAt = new Date()) =>
  prisma.bankCredential.create({ data: { company, label: 'Fake sign-in', accountId, sealed: 'v1.fake', createdAt } })

async function sync(companyId: string) {
  const res = runs.startRun(providers.syncCompany(companyId)!, { username: 'someone', password: 'fake-password' }, start())
  if (!res.ok) throw new Error('busy')
  await vi.waitFor(() => {
    if (runs.getRun(res.run.id)!.status.state === 'running') throw new Error('still running')
  })
  return { id: res.run.id, status: runs.getRun(res.run.id)!.status }
}

const linkOf = async (company: string, externalAccount: string) =>
  (await prisma.syncLink.findUnique({ where: { company_externalAccount: { company, externalAccount } } }))?.accountId

describe('the account chosen on a saved sign-in', () => {
  it('one found account: linked to it without asking, and stored', async () => {
    await signIn('leumi', 'a_leumi2')
    const { status } = await sync('leumi')
    expect(status.state).toBe('done')
    expect(await linkOf('leumi', '000-000000/00')).toBe('a_leumi2')
    expect(await prisma.bankTransaction.count({ where: { accountId: 'a_leumi2' } })).toBeGreaterThan(0)
  })

  it('without a chosen account it still asks', async () => {
    await signIn('leumi', null)
    const { status } = await sync('leumi')
    expect(status.state).toBe('needs-links')
  })

  it('a link already made is kept, whatever the sign-in names', async () => {
    await prisma.syncLink.create({ data: { company: 'leumi', externalAccount: '000-000000/00', accountId: 'acct_leumi' } })
    await signIn('leumi', 'a_leumi2')
    expect((await sync('leumi')).status.state).toBe('done')
    expect(await linkOf('leumi', '000-000000/00')).toBe('acct_leumi')
  })

  it('several found cards: the chosen card with the same digits is linked, only the rest asked', async () => {
    await prisma.account.update({ where: { id: 'a_max2' }, data: { cardLastFour: '5678' } })
    await signIn('max', 'a_max2')
    const { status } = await sync('max')
    expect(status.state).toBe('needs-links')
    if (status.state !== 'needs-links') return
    expect(await linkOf('max', '5678')).toBe('a_max2')
    expect(status.unknown.map(u => u.externalAccount)).toEqual(['1234'])
  })

  it('several found cards, the chosen one without digits: suggested, still asked; digits elsewhere win', async () => {
    await prisma.account.update({ where: { id: 'acct_max' }, data: { cardLastFour: '5678' } })
    await signIn('max', 'a_max2')
    const { status } = await sync('max')
    expect(status.state).toBe('needs-links')
    if (status.state !== 'needs-links') return
    const suggested = Object.fromEntries(status.unknown.map(u => [u.externalAccount, u.suggestedAccountId]))
    expect(suggested).toEqual({ '1234': 'a_max2', '5678': 'acct_max' })
  })

  it('one sign-in per card of the same company: each card goes to the one with its digits', async () => {
    await prisma.account.update({ where: { id: 'acct_max' }, data: { cardLastFour: '1234' } })
    await prisma.account.update({ where: { id: 'a_max2' }, data: { cardLastFour: '5678' } })
    await signIn('max', 'acct_max', new Date(1))
    await signIn('max', 'a_max2', new Date(2))
    expect((await sync('max')).status.state).toBe('done')
    expect(await linkOf('max', '1234')).toBe('acct_max')
    expect(await linkOf('max', '5678')).toBe('a_max2')
  })
})
