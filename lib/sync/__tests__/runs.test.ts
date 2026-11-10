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

  it('fills in a charge an uploaded file left without voucher or notes (ENG-103)', async () => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    const day = israelDay(d.toISOString())!
    const bare = await prisma.creditCardTransaction.create({
      data: {
        accountId: 'acct_max',
        transactionDate: day,
        billingDate: day,
        originalMerchantName: 'FAKE RESTAURANT (FILE)',
        merchantName: 'FAKE RESTAURANT (FILE)',
        chargedAmount: 120,
        originalAmount: 120,
        originalCurrency: '₪',
        category: '',
        cardLastFour: '1234',
        transactionType: 'רגילה',
        sourceFile: 'fake-upload.xlsx',
      },
    })
    await prisma.syncLink.createMany({
      data: [
        { company: 'max', externalAccount: '1234', accountId: 'acct_max' },
        { company: 'max', externalAccount: '5678', ignored: true },
      ],
    })
    const run = await startAndSettle('max')
    if (run.status.state !== 'done') throw new Error(run.status.state)
    expect(run.status.results[0]).toMatchObject({ created: 2, filled: 1 })
    expect(await prisma.creditCardTransaction.findUniqueOrThrow({ where: { id: bare.id } })).toMatchObject({
      reference: '80001',
      notes: 'הערה דמו',
      merchantName: 'FAKE RESTAURANT (FILE)',
    })
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

  it('fills in the אסמכתא and note an uploaded row lacks, and the next sync knows it by its reference (ENG-103)', async () => {
    const d = new Date()
    d.setDate(d.getDate() - 5)
    const day = israelDay(d.toISOString())!
    // Exported without אסמכתא or notes, worded differently; a second row keeps a note typed by hand
    const bare = await prisma.bankTransaction.create({
      data: { accountId: 'acct_leumi', date: day, originalDescription: 'FAKE SUPER (FILE)', description: 'FAKE SUPER (FILE)', debit: 312.4, balance: 0, sourceFile: 'fake-upload.xlsx' },
    })
    d.setDate(d.getDate() + 2)
    const typed = await prisma.bankTransaction.create({
      data: {
        accountId: 'acct_leumi',
        date: israelDay(d.toISOString())!,
        originalDescription: 'FAKE TRANSFER (FILE)',
        description: 'FAKE TRANSFER (FILE)',
        debit: 1500,
        balance: 0,
        note: 'MY OWN NOTE',
        sourceFile: 'fake-upload.xlsx',
      },
    })
    await prisma.syncLink.create({ data: { company: 'leumi', externalAccount: '000-000000/00', accountId: 'acct_leumi' } })

    const first = await startAndSettle('leumi')
    expect(first.status.state).toBe('done')
    if (first.status.state !== 'done') return
    expect(first.status.results[0]).toMatchObject({ created: 2, skipped: 2, skippedByAmount: 2, filled: 2 })
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: bare.id } })).toMatchObject({
      reference: '90002',
      note: 'הערה דמו',
      description: 'FAKE SUPER (FILE)',
    })
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: typed.id } })).toMatchObject({ reference: '90003', note: 'MY OWN NOTE' })

    // Again: both are known by their reference now, nothing new and nothing left to fill
    const again = await startAndSettle('leumi')
    if (again.status.state !== 'done') throw new Error(again.status.state)
    expect(again.status.results[0]).toMatchObject({ created: 0, skippedByAmount: 0, filled: 0 })
    expect(await prisma.bankTransaction.count({ where: { accountId: 'acct_leumi' } })).toBe(4)
  })

  it('fails with a code, not the site text, on a wrong password, and blanks the login', async () => {
    const credentials = { username: 'someone', password: 'wrong' }
    const res = runs.startRun(company('leumi'), credentials, start())
    if (!res.ok) throw new Error('busy')
    expect(await settle(res.run.id)).toEqual({ state: 'failed', code: 'INVALID_PASSWORD', at: 'logging-in' })
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

describe('"sync all" (ENG-92), several at once', () => {
  const login = (password = 'fake-password') => async () => ({ username: 'someone', password })
  /** A made-up company that asks for an SMS code, holding its browser until it gets one */
  const withCode = (id: string) => ({ ...company('leumi'), id, label: id, otp: true })
  const item = (c: ReturnType<typeof company>, l: LoginSource = login()) => ({ company: c, startDate: start(), login: l })
  type LoginSource = import('../runs').LoginSource

  async function settleQueue() {
    await vi.waitFor(() => {
      if (!runs.currentQueue()?.finishedAt) throw new Error('still going')
    })
    return runs.currentQueue()!
  }
  const runOf = (company: string) => runs.currentQueue()!.items.find(i => i.company === company)!.run!
  const waitFor = (company: string, state: string) =>
    vi.waitFor(() => {
      const r = runs.currentQueue()!.items.find(i => i.company === company)?.run
      if (r?.status.state !== state) throw new Error(`${company}: ${r?.status.state}`)
    })

  afterAll(() => {
    delete process.env.TAZRIM_SYNC_CONCURRENCY
  })

  it('starts companies side by side, and skips only the one whose vault login is locked', async () => {
    await prisma.syncLink.create({ data: { company: 'leumi', externalAccount: '000-000000/00', accountId: 'acct_leumi' } })
    await prisma.syncLink.createMany({
      data: [
        { company: 'max', externalAccount: '1234', accountId: 'acct_max' },
        { company: 'max', externalAccount: '5678', ignored: true },
      ],
    })
    const read: string[] = []
    const res = await runs.startQueue([
      item(company('leumi'), async () => (read.push('leumi'), { username: 'someone', password: 'fake-password' })),
      item(company('visaCal'), async () => (read.push('visaCal'), 'VAULT_LOCKED' as const)),
      item(company('max'), async () => (read.push('max'), { username: 'someone', password: 'fake-password' })),
    ])
    expect(res.ok).toBe(true)
    // All three were within the cap, so all were read at the start
    expect(read).toEqual(['leumi', 'visaCal', 'max'])
    if (res.ok) expect(res.queue.items.map(i => i.state)).toEqual(['running', 'skipped', 'running'])
    const q = await settleQueue()
    expect(q.items.map(i => i.state)).toEqual(['done', 'skipped', 'done'])
    expect(q.items[1]).toEqual({ company: 'visaCal', state: 'skipped', code: 'VAULT_LOCKED' })
    expect(q.items[0].created).toBe(4)
    expect(q.items[2].created).toBe(3)
    // Each run is still there to read, by its id
    expect(runs.getRun(q.items[0].run!.id)?.status.state).toBe('done')
  })

  it('never has more than TAZRIM_SYNC_CONCURRENCY browsers open; a free slot starts the next company', async () => {
    process.env.TAZRIM_SYNC_CONCURRENCY = '2'
    const read: string[] = []
    const track = (id: string) => async () => (read.push(id), { username: 'someone', password: 'fake-password' })
    await runs.startQueue([item(withCode('a'), track('a')), item(withCode('b'), track('b')), item(withCode('c'), track('c'))])
    await waitFor('a', 'needs-code')
    await waitFor('b', 'needs-code')
    // Two wait for their codes with their browsers open: the third waits for a slot
    expect(read).toEqual(['a', 'b'])
    expect(runs.currentQueue()!.items[2]).toEqual({ company: 'c', state: 'waiting' })

    expect(runs.submitCode(runOf('b').id, '123456')).toBe(true)
    // b's browser closed once the site answered, so c starts
    await waitFor('c', 'needs-code')
    expect(read).toEqual(['a', 'b', 'c'])
    expect(runs.cancelRun(runOf('a').id)).toBe(true)
    expect(runs.cancelRun(runOf('c').id)).toBe(true)
    await vi.waitFor(() => {
      if (runOf('b').status.state === 'running') throw new Error('b still running')
    })
    if (runOf('b').status.state === 'needs-links') runs.cancelRun(runOf('b').id)
    const q = await settleQueue()
    expect(q.items.map(i => [i.company, i.state])).toEqual([
      ['a', 'failed'],
      ['b', 'failed'],
      ['c', 'failed'],
    ])
  })

  it('two SMS codes at once: each prompt answers its own run', async () => {
    await runs.startQueue([item(withCode('a'), login()), item(company('oneZero'), async () => ({ email: 'a@example.com', password: 'p', phoneNumber: '0500000000' }))])
    await waitFor('a', 'needs-code')
    await waitFor('oneZero', 'needs-code')
    // The second one first; a wrong code fails only its own run
    expect(runs.submitCode(runOf('oneZero').id, '123456')).toBe(true)
    expect(runs.submitCode(runOf('a').id, '000000')).toBe(true)
    await waitFor('oneZero', 'needs-links')
    await waitFor('a', 'failed')
    expect(runOf('a').status).toMatchObject({ state: 'failed', code: 'OTP' })
    runs.cancelRun(runOf('oneZero').id)
    await settleQueue()
  })

  it('a run waiting for links holds only its own row: the others finish meanwhile', async () => {
    await prisma.syncLink.create({ data: { company: 'leumi', externalAccount: '000-000000/00', accountId: 'acct_leumi' } })
    process.env.TAZRIM_SYNC_CONCURRENCY = '1'
    await runs.startQueue([item(company('max')), item(company('leumi'))])
    await waitFor('max', 'needs-links')
    // Even with one slot: waiting for links holds no browser, so leumi runs and ends
    await waitFor('leumi', 'done')
    expect(runs.currentQueue()!.finishedAt).toBeNull()
    expect(runs.currentQueue()!.items.map(i => i.state)).toEqual(['running', 'done'])

    await runs.submitLinks(runOf('max').id, [
      { externalAccount: '1234', action: 'link', accountId: 'acct_max' },
      { externalAccount: '5678', action: 'ignore' },
    ])
    const q = await settleQueue()
    expect(q.items.map(i => i.state)).toEqual(['done', 'done'])
  })

  it('BUSY: nothing else starts while it goes, nor it while a single sync goes', async () => {
    const single = runs.startRun(withCode('a'), { username: 'u', password: 'p' }, start())
    if (!single.ok) throw new Error('busy')
    await vi.waitFor(() => expect(runs.getRun(single.run.id)!.status.state).toBe('needs-code'))
    expect(await runs.startQueue([item(company('max'))])).toEqual({ ok: false, code: 'BUSY' })
    runs.cancelRun(single.run.id)

    const res = await runs.startQueue([item(withCode('b'))])
    expect(res.ok).toBe(true)
    // The single sync's run is gone once "sync all" starts
    expect(runs.currentRun()).toBeNull()
    await waitFor('b', 'needs-code')
    expect(runs.startRun(company('max'), { username: 'x', password: 'y' }, start())).toEqual({ ok: false, code: 'BUSY' })
    expect(await runs.startQueue([item(company('max'))])).toEqual({ ok: false, code: 'BUSY' })
    runs.cancelRun(runOf('b').id)
    await settleQueue()
    // Once it ended, a sync starts again
    const after = runs.startRun(company('max'), { username: 'x', password: 'y' }, start())
    expect(after.ok).toBe(true)
    if (after.ok) await settle(after.run.id)
  })

  it('caps at 3 by default', () => {
    delete process.env.TAZRIM_SYNC_CONCURRENCY
    expect(runs.syncConcurrency()).toBe(3)
    process.env.TAZRIM_SYNC_CONCURRENCY = 'nonsense'
    expect(runs.syncConcurrency()).toBe(3)
    process.env.TAZRIM_SYNC_CONCURRENCY = '5'
    expect(runs.syncConcurrency()).toBe(5)
  })

  it('nothing to sync: EMPTY', async () => {
    expect(await runs.startQueue([])).toEqual({ ok: false, code: 'EMPTY' })
  })
})
