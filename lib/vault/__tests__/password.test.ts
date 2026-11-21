/**
 * Opening the vault with a person's password (ENG-135), against a real migrated
 * database: turning it on, wrong passwords, opening, the copy following a password
 * change (re-made while open, dropped while locked), removal, and the other ways
 * (passkey, recovery key) staying as they were. All values are made up.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { entriesAfter, resetLog } from '@/lib/log/buffer'
import { isSensitiveRoute, logged } from '@/lib/log/route'
import { resetRateLimits } from '@/lib/auth/rate-limit'
import { keyFromPassword, newPasswordKdf, newSalt, open, passwordWrapAad } from '../crypto'

let db: TestDb
let vault: typeof import('../vault')
let household: typeof import('@/lib/auth/household')
let recovery = ''

const PW = 'fake-long-password-for-tests-1'
const phone = { id: 'pk-phone', prf: randomBytes(32), salt: newSalt() }
const wrapRows = (where = '"personId" IS NOT NULL') => db.query<{ personId: string; kdf: string; wrappedKey: string }>(`SELECT * FROM "VaultKeyWrap" WHERE ${where}`)

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
    INSERT INTO "Person" ("id","name") VALUES ('p1','Owner'), ('p2','Partner');
    INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-phone','p1','cred-phone',X'00','iPhone');
  `)
  usePrismaOn(db)
  household = await import('@/lib/auth/household')
  vault = await import('../vault')
  await household.setPassword('p1', PW)
  await household.setPassword('p2', 'fake-partner-password-2')
  recovery = (await vault.createVault(phone.id, phone.prf, phone.salt, 'Owner, iPhone')) as string
})
beforeEach(resetRateLimits)
afterAll(async () => {
  vault.lock()
  await releasePrisma()
  db.cleanup()
})

describe('turning it on', () => {
  it('needs the vault open', async () => {
    vault.lock()
    await expect(vault.enablePasswordUnlock('p1', PW)).rejects.toThrow(vault.VaultLockedError)
    expect(await vault.unlockWithPasskey(phone.id, phone.prf, 'x')).toBe(true)
  })

  it('refuses a wrong password and stores nothing', async () => {
    expect(await vault.enablePasswordUnlock('p1', 'not-my-password')).toBe('wrong-password')
    expect(await vault.enablePasswordUnlock('p1', '')).toBe('wrong-password')
    expect(await vault.enablePasswordUnlock('p1', undefined)).toBe('wrong-password')
    expect(wrapRows()).toHaveLength(0)
  })

  it('refuses a person with no password', async () => {
    db.exec(`INSERT INTO "Person" ("id","name") VALUES ('p3','Guest')`)
    expect(await vault.enablePasswordUnlock('p3', PW)).toBe('no-password')
  })

  it('stores a copy with strong scrypt parameters, its own salt, and the person as associated data', async () => {
    expect(await vault.enablePasswordUnlock('p1', PW)).toBe('ok')
    const [row] = wrapRows()
    expect(row.personId).toBe('p1')
    const [kind, n, r, p, salt] = row.kdf.split('$')
    expect([kind, Number(n), Number(r), Number(p)]).toEqual(['scrypt', 2 ** 17, 8, 1])
    expect(Buffer.from(salt, 'base64url')).toHaveLength(16)
    expect(row.kdf).not.toBe(newPasswordKdf()) // a fresh salt each time
    const k = (await keyFromPassword(PW, row.kdf))!
    expect(open(k, row.wrappedKey, passwordWrapAad('p1'))).not.toBeNull()
    expect(open(k, row.wrappedKey, passwordWrapAad('p2'))).toBeNull() // not movable to another person
    expect(JSON.stringify(db.query(`SELECT * FROM "VaultKeyWrap"`))).not.toContain(PW)
  })

  it('shows in the status, and the recovery key row still counts as the recovery key', async () => {
    expect(await vault.status()).toMatchObject({ hasRecoveryKey: true, passwords: ['p1'], passkeys: ['pk-phone'] })
  })
})

describe('opening with it', () => {
  it('opens with the right password; a wrong one, an empty one, or someone without a copy does not', async () => {
    vault.lock()
    expect(await vault.unlockWithPassword('p1', 'wrong-password')).toBe(false)
    expect(await vault.unlockWithPassword('p1', '', 'x')).toBe(false)
    expect(await vault.unlockWithPassword('p2', 'fake-partner-password-2', 'x')).toBe(false)
    expect((await vault.status()).open).toBe(false)
    expect(await vault.unlockWithPassword('p1', PW, 'Owner, סיסמה')).toBe(true)
    expect(await vault.status()).toMatchObject({ open: true, openedBy: 'Owner, סיסמה' })
  })

  it("someone else's password never opens a copy that isn't theirs", async () => {
    vault.lock()
    expect(await vault.unlockWithPassword('p1', 'fake-partner-password-2', 'x')).toBe(false)
  })

  it('the passkey and recovery key paths are as before', async () => {
    vault.lock()
    expect(await vault.unlockWithPasskey(phone.id, phone.prf, 'x')).toBe(true)
    vault.lock()
    expect(await vault.unlockWithRecovery(recovery, 'x')).toBe(true)
    const next = await vault.replaceRecoveryKey() // must not delete the password copy
    expect(wrapRows()).toHaveLength(1)
    vault.lock()
    expect(await vault.unlockWithRecovery(recovery, 'x')).toBe(false)
    expect(await vault.unlockWithRecovery(next, 'x')).toBe(true)
    recovery = next
  })

  it('from the database and the environment alone it does not open', async () => {
    vault.lock()
    const [row] = wrapRows()
    // scrypt is slow on purpose, so a handful of the strings stored and in the environment
    const candidates = [...Object.values(row), ...Object.values(process.env)].filter((v): v is string => typeof v === 'string' && !!v).slice(0, 6)
    for (const c of candidates) {
      const k = await keyFromPassword(c, row.kdf)
      expect(k && open(k, row.wrappedKey, passwordWrapAad('p1'))).toBeFalsy()
    }
  }, 30_000)
})

describe('the password changes', () => {
  it('while open: the copy is re-made, the new password opens, the old one does not', async () => {
    expect(await vault.unlockWithRecovery(recovery, 'x')).toBe(true)
    const before = wrapRows()[0]
    await household.setPassword('p1', 'fake-new-password-3')
    await vault.passwordChanged('p1', 'fake-new-password-3')
    expect(wrapRows()[0].kdf).not.toBe(before.kdf)
    vault.lock()
    expect(await vault.unlockWithPassword('p1', PW, 'x')).toBe(false)
    expect(await vault.unlockWithPassword('p1', 'fake-new-password-3', 'x')).toBe(true)
  })

  it("while open, someone who hadn't turned it on does not get a copy", async () => {
    await vault.passwordChanged('p2', 'fake-partner-new-4')
    expect(wrapRows("\"personId\" = 'p2'")).toHaveLength(0)
  })

  it('while locked: their copy is deleted (and nothing else)', async () => {
    vault.lock()
    await vault.passwordChanged('p1', 'fake-newer-password-5')
    expect(wrapRows()).toHaveLength(0)
    expect(await vault.unlockWithPassword('p1', 'fake-new-password-3', 'x')).toBe(false)
    expect(await vault.status()).toMatchObject({ hasRecoveryKey: true, passkeys: ['pk-phone'], passwords: [] })
    expect(await vault.unlockWithPasskey(phone.id, phone.prf, 'x')).toBe(true)
  })

  it('removing the password removes the copy', async () => {
    await household.setPassword('p1', PW)
    expect(await vault.enablePasswordUnlock('p1', PW)).toBe('ok')
    await vault.passwordChanged('p1', null)
    expect(wrapRows()).toHaveLength(0)
  })
})

describe('turning it off, and removal', () => {
  it('turning it off removes only that person\'s copy', async () => {
    expect(await vault.enablePasswordUnlock('p1', PW)).toBe('ok')
    await household.setPassword('p2', 'fake-partner-password-2')
    expect(await vault.enablePasswordUnlock('p2', 'fake-partner-password-2')).toBe('ok')
    await vault.disablePasswordUnlock('p1')
    expect(wrapRows().map(r => r.personId)).toEqual(['p2'])
  })

  it('removing a person removes their copy, and keeps the others', async () => {
    expect(await vault.enablePasswordUnlock('p1', PW)).toBe('ok')
    const { prisma } = await import('@/lib/db/client')
    await prisma.person.delete({ where: { id: 'p2' } })
    expect(wrapRows().map(r => r.personId)).toEqual(['p1'])
    expect(await vault.status()).toMatchObject({ hasRecoveryKey: true })
  })

  it('starting over deletes password copies too', async () => {
    await vault.resetVault()
    expect(db.query(`SELECT 1 FROM "VaultKeyWrap"`)).toHaveLength(0)
  })
})

describe('the route stays out of the log', () => {
  it('is a sensitive route: the body is logged as keys only', async () => {
    expect(isSensitiveRoute('/api/vault/password')).toBe(true)
    resetLog()
    const req = new Request('http://localhost:3000/api/vault/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PW }),
    })
    await logged(async (r: Request) => (await r.json(), Response.json({ error: 'x' }, { status: 403 })))(req)
    const dump = JSON.stringify(entriesAfter())
    expect(dump).toContain('"password"')
    expect(dump).not.toContain(PW)
  })
})

describe('wrong passwords are rate-limited like sign-in', () => {
  it('the route\'s bucket allows 10 tries in 15 minutes per client, then refuses', async () => {
    const { allow } = await import('@/lib/auth/http')
    const req = new Request('http://localhost:3000/api/vault/password', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' } })
    const results = Array.from({ length: 12 }, () => allow(req, 'vault-password', 10, 15 * 60 * 1000))
    expect(results.filter(Boolean)).toHaveLength(10)
    expect(results.slice(10)).toEqual([false, false])
    // another client has its own count
    expect(allow(new Request(req.url, { headers: { 'x-forwarded-for': '203.0.113.10' } }), 'vault-password', 10, 15 * 60 * 1000)).toBe(true)
  })
})
