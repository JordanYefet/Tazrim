/**
 * The sync with sign-ins saved in the vault (ENG-92), through /api/sync and the
 * made-up site (TAZRIM_FAKE_SYNC): a saved sign-in is read on the server and
 * never sent back, a locked vault answers 423, typed details can be saved, and
 * "sync all" runs every company with a saved sign-in. Made-up values only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '../../db/__tests__/test-db'
import { newSalt } from '@/lib/vault/crypto'

const PASSWORD = 'fake-bank-password-7Q'
const phone = { id: 'pk-phone', prf: randomBytes(32), salt: newSalt() }

let db: TestDb
let route: typeof import('@/app/api/sync/route')
let runs: typeof import('../runs')
let vault: typeof import('@/lib/vault/vault')

beforeAll(async () => {
  process.env.TAZRIM_FAKE_SYNC = '1'
  db = createTestDb()
  db.exec(`
    INSERT INTO "Person" ("id","name") VALUES ('p1','Owner');
    INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-phone','p1','cred-phone',X'00','iPhone');
    INSERT INTO "SyncLink" ("id","company","externalAccount","accountId","createdAt") VALUES ('l1','leumi','000-000000/00','acct_leumi',0);
    INSERT INTO "SyncLink" ("id","company","externalAccount","accountId","createdAt") VALUES ('l2','max','1234','acct_max',0);
    INSERT INTO "SyncLink" ("id","company","externalAccount","accountId","createdAt") VALUES ('l3','max','5678',NULL,0);
  `)
  usePrismaOn(db)
  route = await import('@/app/api/sync/route')
  runs = await import('../runs')
  vault = await import('@/lib/vault/vault')
})

beforeEach(() => runs.resetRuns())

afterAll(async () => {
  runs.resetRuns()
  vault.lock()
  await releasePrisma()
  db.cleanup()
  delete process.env.TAZRIM_FAKE_SYNC
})

const req = (method = 'GET', body?: unknown) =>
  new Request('http://localhost/api/sync', {
    method,
    headers: { 'content-type': 'application/json', host: 'localhost:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const call = async (body?: unknown) => {
  const res = body === undefined ? await route.GET(req()) : await route.POST(req('POST', body))
  const text = await res.text()
  return { status: res.status, text, body: JSON.parse(text) }
}
const monthAgo = () => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
async function settle() {
  await vi.waitFor(() => {
    const r = runs.currentRun()
    const q = runs.currentQueue()
    if (q && !q.finishedAt) throw new Error('queue going')
    if (!r || r.status.state === 'running') throw new Error('running')
  })
}

describe('sync with the vault (ENG-92)', () => {
  it('without a vault: no saved sign-ins, "sync all" needs the vault', async () => {
    const info = await call()
    expect(info.body.vault).toEqual({ exists: false, open: false })
    expect(info.body.companies.every((c: { savedLogin: unknown }) => c.savedLogin === null)).toBe(true)
    expect((await call({ all: true })).status).toBe(423)
  })

  it('typed details with save: the sync runs and they are kept in the vault, sealed', async () => {
    await vault.createVault(phone.id, phone.prf, phone.salt, 'Owner, iPhone')
    const res = await call({ company: 'leumi', credentials: { username: 'someone', password: PASSWORD }, startDate: monthAgo(), save: true })
    expect(res.status).toBe(200)
    await settle()
    const saved = db.query<{ company: string; sealed: string }>(`SELECT company, sealed FROM "BankCredential"`)
    expect(saved.map(s => s.company)).toEqual(['leumi'])
    expect(saved[0].sealed).not.toContain(PASSWORD)
    const info = await call()
    expect(info.body.companies.find((c: { id: string }) => c.id === 'leumi').savedLogin).toBeTruthy()
    expect(info.text).not.toContain(PASSWORD)
  })

  it('saving again replaces the saved sign-in instead of adding one', async () => {
    await call({ company: 'leumi', credentials: { username: 'someone', password: PASSWORD + '2' }, startDate: monthAgo(), save: true })
    await settle()
    expect(db.query(`SELECT 1 FROM "BankCredential"`)).toHaveLength(1)
  })

  it('the saved sign-in: read on the server, never in a response; locked → 423', async () => {
    const res = await call({ company: 'leumi', saved: true, startDate: monthAgo() })
    expect(res.status).toBe(200)
    expect(res.text).not.toContain(PASSWORD)
    await settle()
    expect(runs.currentRun()!.status.state).toBe('done')

    vault.lock()
    const locked = await call({ company: 'leumi', saved: true, startDate: monthAgo() })
    expect(locked.status).toBe(423)
    expect(locked.body.code).toBe('VAULT_LOCKED')
    expect((await call({ company: 'max', saved: true, startDate: monthAgo() })).body.code).toBe('NOTHING_SAVED')
  })

  it('"sync all": every company with a saved sign-in, one after another', async () => {
    await vault.unlockWithPasskey(phone.id, phone.prf, 'Owner, iPhone')
    await vault.saveCredential({ company: 'max', label: 'Max', accountId: null, fields: { username: 'someone', password: PASSWORD } })
    const res = await call({ all: true })
    expect(res.status).toBe(200)
    expect(res.body.queue.items.map((i: { company: string }) => i.company)).toEqual(['leumi', 'max'])
    expect(res.text).not.toContain(PASSWORD)
    await settle()
    const q = (await call()).body.queue
    expect(q.items.map((i: { state: string }) => i.state)).toEqual(['done', 'done'])
    // A single sync afterwards replaces the finished queue
    await call({ company: 'max', saved: true, startDate: monthAgo() })
    expect((await call()).body.queue).toBeNull()
    await settle()
  })
})
