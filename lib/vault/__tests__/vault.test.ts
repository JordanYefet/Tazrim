/**
 * The vault (ENG-90) against a real migrated database: creating it, opening
 * it with a passkey's PRF output or the recovery key, locking (by hand, when
 * idle, on restart), copies for more passkeys, revoking, and that nothing
 * stored opens it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { keyFromPrf, keyFromRecovery, newSalt, open, wrapAad } from '../crypto'

let db: TestDb
let vault: typeof import('../vault')

const PASSWORD = 'fake-bank-password-7Q'
const phone = { id: 'pk-phone', prf: randomBytes(32), salt: newSalt() }
const mac = { id: 'pk-mac', prf: randomBytes(32), salt: newSalt() }
let recovery = ''
let credentialId = ''

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
    INSERT INTO "Person" ("id","name") VALUES ('p1','Owner');
    INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-phone','p1','cred-phone',X'00','iPhone');
    INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-mac','p1','cred-mac',X'00','Mac');
  `)
  usePrismaOn(db)
  vault = await import('../vault')
})
afterEach(() => {
  vi.useRealTimers()
  delete process.env.TAZRIM_VAULT_IDLE_MINUTES
})
afterAll(async () => {
  vault.lock()
  await releasePrisma()
  db.cleanup()
})

describe('the vault', () => {
  it('starts with none, and refuses to read or store while locked', async () => {
    expect((await vault.status()).exists).toBe(false)
    await expect(vault.saveCredential({ company: 'max', label: 'x', accountId: null, fields: {} })).rejects.toThrow(vault.VaultLockedError)
  })

  it('is created with a passkey, open, with a recovery key; a second create is refused', async () => {
    recovery = (await vault.createVault(phone.id, phone.prf, phone.salt, 'Owner, iPhone')) as string
    expect(recovery).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/)
    const s = await vault.status()
    expect(s).toMatchObject({ exists: true, open: true, hasRecoveryKey: true, passkeys: ['pk-phone'], openedBy: 'Owner, iPhone' })
    expect(await vault.createVault(mac.id, mac.prf, mac.salt, 'x')).toBe('exists')
  })

  it('stores a sign-in sealed, reads it back while open, and never while locked', async () => {
    credentialId = (await vault.saveCredential({ company: 'max', label: 'MAX', accountId: null, fields: { username: 'fake-user', password: PASSWORD } })).id
    expect(await vault.readCredential(credentialId)).toEqual({ username: 'fake-user', password: PASSWORD })
    expect((await vault.listCredentials())[0]).toMatchObject({ company: 'max', label: 'MAX' })
    vault.lock()
    expect((await vault.status()).open).toBe(false)
    await expect(vault.readCredential(credentialId)).rejects.toThrow(vault.VaultLockedError)
  })

  it('opens again only with the same PRF output', async () => {
    expect(await vault.unlockWithPasskey(phone.id, randomBytes(32), 'x')).toBe(false)
    expect(await vault.unlockWithPasskey(mac.id, mac.prf, 'x')).toBe(false) // no copy yet
    expect(await vault.unlockWithPasskey(phone.id, phone.prf, 'Owner, iPhone')).toBe(true)
    expect((await vault.readCredential(credentialId))?.password).toBe(PASSWORD)
  })

  it('locks itself after the idle time, and is reset by use', async () => {
    process.env.TAZRIM_VAULT_IDLE_MINUTES = '1'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 50_000)
    expect((await vault.status()).open).toBe(true)
    await vault.readCredential(credentialId) // counts as use
    vi.setSystemTime(Date.now() + 50_000)
    expect((await vault.status()).open).toBe(true)
    vi.setSystemTime(Date.now() + 61_000)
    expect((await vault.status()).open).toBe(false)
  })

  it('a restart (a new process: nothing in memory) leaves it locked', async () => {
    expect(await vault.unlockWithPasskey(phone.id, phone.prf, 'x')).toBe(true)
    ;(globalThis as { __tazrimVault?: unknown }).__tazrimVault = undefined
    vi.resetModules()
    const fresh = await import('../vault')
    expect((await fresh.status()).open).toBe(false)
    await expect(fresh.readCredential(credentialId)).rejects.toThrow(fresh.VaultLockedError)
    vault = fresh
  })

  it('opens with the recovery key, typed loosely; a wrong one fails', async () => {
    expect(await vault.unlockWithRecovery('AAAA-BBBB', 'x')).toBe(false)
    expect(await vault.unlockWithRecovery(recovery.toLowerCase(), 'Owner, recovery')).toBe(true)
    expect((await vault.readCredential(credentialId))?.password).toBe(PASSWORD)
  })

  it('gives another passkey its own copy while open, and a new recovery key replaces the old', async () => {
    await vault.addPasskey(mac.id, mac.prf, mac.salt)
    vault.lock()
    expect(await vault.unlockWithPasskey(mac.id, mac.prf, 'Owner, Mac')).toBe(true)
    const next = await vault.replaceRecoveryKey()
    vault.lock()
    expect(await vault.unlockWithRecovery(recovery, 'x')).toBe(false)
    expect(await vault.unlockWithRecovery(next, 'x')).toBe(true)
    recovery = next
  })

  it('revoking a passkey deletes its copy, and the others still open', async () => {
    const { revokePasskey } = await import('@/lib/auth/household')
    expect(await revokePasskey(mac.id)).toBe('ok')
    expect(db.query(`SELECT 1 FROM "VaultKeyWrap" WHERE "passkeyId" = 'pk-mac'`)).toHaveLength(0)
    vault.lock()
    expect(await vault.unlockWithPasskey(mac.id, mac.prf, 'x')).toBe(false)
    expect(await vault.unlockWithPasskey(phone.id, phone.prf, 'x')).toBe(true)
  })

  it('a sealed sign-in that was changed, or moved to another row, does not open', async () => {
    const row = db.query<{ sealed: string }>(`SELECT sealed FROM "BankCredential" WHERE id = '${credentialId}'`)[0]
    const [v, iv, tag, ct] = row.sealed.split('.')
    const bad = Buffer.from(ct, 'base64url')
    bad[1] ^= 1
    db.exec(`UPDATE "BankCredential" SET sealed = '${[v, iv, tag, bad.toString('base64url')].join('.')}' WHERE id = '${credentialId}'`)
    expect(await vault.readCredential(credentialId)).toBeNull()
    db.exec(`UPDATE "BankCredential" SET sealed = '${row.sealed}' WHERE id = '${credentialId}'`)
    const other = (await vault.saveCredential({ company: 'visaCal', label: 'Cal', accountId: null, fields: { username: 'u', password: 'p' } })).id
    db.exec(`UPDATE "BankCredential" SET sealed = '${row.sealed}' WHERE id = '${other}'`)
    expect(await vault.readCredential(other)).toBeNull()
  })

  it('locked, the database file plus every env var opens nothing', async () => {
    vault.lock()
    const file = readFileSync(db.file)
    expect(file.includes(Buffer.from(PASSWORD))).toBe(false)
    expect(file.includes(Buffer.from(recovery))).toBe(false)
    // Every string stored or in the environment, tried as a PRF output or a recovery key, against every copy
    const stored = db.query<Record<string, unknown>>(`SELECT * FROM "VaultKeyWrap"`)
    const candidates = [
      ...stored.flatMap(r => Object.values(r).filter((v): v is string => typeof v === 'string')),
      ...Object.values(process.env).filter((v): v is string => !!v),
    ]
    for (const w of stored as { passkeyId: string | null; prfSalt: string | null; wrappedKey: string }[]) {
      for (const c of candidates) {
        const asPrf = Buffer.alloc(32)
        Buffer.from(c).copy(asPrf)
        const k = w.prfSalt ? keyFromPrf(asPrf, w.prfSalt) : keyFromRecovery(c)
        expect(open(k, w.wrappedKey, wrapAad(w.passkeyId))).toBeNull()
      }
    }
  })
})
