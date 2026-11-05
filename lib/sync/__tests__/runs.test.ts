import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '../../db/__tests__/test-db'
import { israelDay } from '../map'

// The made-up site (TAZRIM_FAKE_SYNC) only: fake merchants, amounts and card digits.
let db: TestDb
let runs: typeof import('../runs')
let providers: typeof import('../providers')
let prisma: typeof import('../../db/client')['prisma']

beforeAll(async () => {
  process.env.TAZRIM_FAKE_SYNC = '1'
  db = createTestDb()
  usePrismaOn(db)
  runs = await import('../runs')
  providers = await import('../providers')
  prisma = (await import('../../db/client')).prisma
})

beforeEach(async () => {
  runs.resetRuns()
  await prisma.syncLink.deleteMany()
  await prisma.bankTransaction.deleteMany()
  await prisma.creditCardTransaction.deleteMany()
  await prisma.uploadHistory.deleteMany()
  await prisma.account.deleteMany({ where: { id: { notIn: ['acct_leumi', 'acct_max'] } } })
})

afterAll(async () => {
  runs.resetRuns()
  await releasePrisma()
  db.cleanup()
  delete process.env.TAZRIM_FAKE_SYNC
})

const company = (id: string) => providers.syncCompany(id)!
const start = () => new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)

async function settle(id: string) {
  await vi.waitFor(() => {
    const s = runs.getRun(id)!.status.state
    if (s === 'running') throw new Error('still running')
  })
  return runs.getRun(id)!.status
}

async function startAndSettle(companyId: string, password = 'fake-password') {
  const res = runs.startRun(company(companyId), { username: 'someone', password }, start())
  if (!res.ok) throw new Error('busy')
  return { id: res.run.id, status: await settle(res.run.id) }
}

describe('a card sync', () => {
  it('asks about cards it does not know, stores after the answers, and remembers them', async () => {
    const first = await startAndSettle('max')
    expect(first.status.state).toBe('needs-links')
    if (first.status.state !== 'needs-links') return
    expect(first.status.unknown.map(u => u.label).sort()).toEqual(['1234', '5678'])

    const res = await runs.submitLinks(first.id, [
      { externalAccount: '1234', action: 'link', accountId: 'acct_max' },
      { externalAccount: '5678', action: 'create' },
    ])
    expect(res.ok).toBe(true)
    const done = await settle(first.id)
    expect(done.state).toBe('done')
    if (done.state !== 'done') return
    // Pending charges are left for a later sync
    expect(done.results.map(r => r.created).sort()).toEqual([1, 3])

    const created = await prisma.account.findFirstOrThrow({ where: { cardLastFour: '5678' } })
    expect(created).toMatchObject({ kind: 'CREDIT_CARD', provider: 'max', displayName: 'מקס 5678' })
    const inst = await prisma.creditCardTransaction.findFirstOrThrow({ where: { notes: { contains: 'תשלום' } } })
    expect(inst).toMatchObject({ chargedAmount: 100, notes: 'תשלום 1 מתוך 3', accountId: 'acct_max' })
    expect(await prisma.uploadHistory.count()).toBe(2)

    // The same range again: no questions, nothing new
    const again = await startAndSettle('max')
    expect(again.status.state).toBe('done')
    if (again.status.state === 'done') expect(again.status.results.every(r => r.created === 0)).toBe(true)
    expect(await prisma.creditCardTransaction.count()).toBe(4)
  })

  it('stores nothing for an ignored card', async () => {
    const first = await startAndSettle('max')
    await runs.submitLinks(first.id, [
      { externalAccount: '1234', action: 'ignore' },
      { externalAccount: '5678', action: 'ignore' },
    ])
    expect((await settle(first.id)).state).toBe('done')
    expect(await prisma.creditCardTransaction.count()).toBe(0)
  })

  it('refuses answers that do not cover every unknown card', async () => {
    const first = await startAndSettle('max')
    expect(await runs.submitLinks(first.id, [{ externalAccount: '1234', action: 'ignore' }])).toEqual({ ok: false, code: 'INVALID' })
  })
})

describe('a bank sync', () => {
  it('suggests the only bank account, works the balance back, and skips a row an upload already has under the same reference', async () => {
    // An earlier upload of the same transaction, worded differently by the exported file
    // The Israeli day the made-up site dates it on, as the sync reads it (CI runs in UTC)
    const d = new Date()
    d.setDate(d.getDate() - 5)
    const day = israelDay(d.toISOString())!
    await prisma.bankTransaction.create({
      data: {
        accountId: 'acct_leumi',
        date: day,
        originalDescription: 'FAKE SUPER (FILE WORDING)',
        description: 'FAKE SUPER (FILE WORDING)',
        debit: 312.4,
        balance: 0,
        reference: '90002',
        sourceFile: 'fake-upload.xlsx',
      },
    })

    const first = await startAndSettle('leumi')
    expect(first.status.state).toBe('needs-links')
    if (first.status.state !== 'needs-links') return
    expect(first.status.unknown[0].suggestedAccountId).toBe('acct_leumi')
    await runs.submitLinks(first.id, [{ externalAccount: '000-000000/00', action: 'link', accountId: 'acct_leumi' }])
    const done = await settle(first.id)
    expect(done.state).toBe('done')
    if (done.state !== 'done') return
    expect(done.results[0]).toMatchObject({ created: 3, skipped: 1, pending: 1 })

    const rows = await prisma.bankTransaction.findMany({ where: { sourceFile: { startsWith: 'sync-leumi-' } }, orderBy: { date: 'asc' } })
    expect(rows.at(-1)!.balance).toBe(5432.1)
  })

  it('fails with a code, not the site text, on a wrong password, and blanks the login', async () => {
    const credentials = { username: 'someone', password: 'wrong' }
    const res = runs.startRun(company('leumi'), credentials, start())
    if (!res.ok) throw new Error('busy')
    expect(await settle(res.run.id)).toEqual({ state: 'failed', code: 'INVALID_PASSWORD' })
    expect(credentials).toEqual({ username: '', password: '' })
  })

  it('runs one sync at a time', async () => {
    const a = runs.startRun(company('leumi'), { username: 'u', password: 'p' }, start())
    const b = runs.startRun(company('max'), { username: 'u', password: 'p' }, start())
    expect(a.ok).toBe(true)
    expect(b).toEqual({ ok: false, code: 'BUSY' })
    if (a.ok) await settle(a.run.id)
  })
})

describe('an SMS code', () => {
  it('waits for the code and goes on once it is typed', async () => {
    const res = runs.startRun(company('oneZero'), { email: 'a@example.com', password: 'p', phoneNumber: '0500000000' }, start())
    if (!res.ok) throw new Error('busy')
    await vi.waitFor(() => expect(runs.getRun(res.run.id)!.status.state).toBe('needs-code'))
    expect(runs.submitCode(res.run.id, '123456')).toBe(true)
    expect((await settle(res.run.id)).state).toBe('needs-links')
  })
})
