/**
 * A passkey's mailbox (ENG-140): the seal's round trip, and the unlock paths against a real migrated
 * database: its own copy, a copy waiting in the mailbox (converted), the vault already open (added),
 * and locked with nothing (VAULT_PENDING, mailbox stored). Opening by someone else leaves a copy for
 * every waiting passkey; revoking a passkey takes its mailbox with it. Fake values only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { newMailbox, newSalt, newVaultKey, openFromMailbox, openMailboxPrivate, sealToMailbox } from '../crypto'

describe('the mailbox seal', () => {
  const prf = randomBytes(32)
  const salt = newSalt()

  it('round-trips a vault key: sealed to the public key, opened with the PRF output', () => {
    const box = newMailbox('pk-1', prf, salt)
    const vaultKey = newVaultKey()
    const sealed = sealToMailbox(box.publicKey, vaultKey, 'pk-1')
    const priv = openMailboxPrivate('pk-1', box.sealedPrivate, prf, salt)!
    expect(priv).toHaveLength(32)
    expect(openFromMailbox(priv, sealed, 'pk-1')?.equals(vaultKey)).toBe(true)
  })

  it('a different seal each time, and the private key never shows in what is stored', () => {
    const box = newMailbox('pk-1', prf, salt)
    const vaultKey = newVaultKey()
    expect(sealToMailbox(box.publicKey, vaultKey, 'pk-1')).not.toBe(sealToMailbox(box.publicKey, vaultKey, 'pk-1'))
    const priv = openMailboxPrivate('pk-1', box.sealedPrivate, prf, salt)!
    expect(JSON.stringify(box)).not.toContain(priv.toString('base64url'))
  })

  it('opens nothing with another PRF output, salt, passkey, or key pair, or a changed byte', () => {
    const box = newMailbox('pk-1', prf, salt)
    expect(openMailboxPrivate('pk-1', box.sealedPrivate, randomBytes(32), salt)).toBeNull()
    expect(openMailboxPrivate('pk-1', box.sealedPrivate, prf, newSalt())).toBeNull()
    expect(openMailboxPrivate('pk-2', box.sealedPrivate, prf, salt)).toBeNull()
    const vaultKey = newVaultKey()
    const sealed = sealToMailbox(box.publicKey, vaultKey, 'pk-1')
    const priv = openMailboxPrivate('pk-1', box.sealedPrivate, prf, salt)!
    expect(openFromMailbox(priv, sealed, 'pk-2')).toBeNull()
    const other = newMailbox('pk-1', randomBytes(32), salt)
    const otherPriv = openMailboxPrivate('pk-1', other.sealedPrivate, Buffer.alloc(32), salt)
    expect(otherPriv).toBeNull()
    // Change the first character of the tag: all six of its bits count (the last one's may not)
    const [eph, version, iv, tag, ct] = sealed.split('.')
    const flipped = [eph, version, iv, `${tag[0] === 'A' ? 'B' : 'A'}${tag.slice(1)}`, ct].join('.')
    expect(openFromMailbox(priv, flipped, 'pk-1')).toBeNull()
    expect(openFromMailbox(priv, 'nonsense', 'pk-1')).toBeNull()
  })
})

describe('unlocking with a passkey that may have no copy', () => {
  let db: TestDb
  let vault: typeof import('../vault')
  const keys = {
    owner: { id: 'pk-owner', prf: randomBytes(32), salt: newSalt() },
    anna: { id: 'pk-anna', prf: randomBytes(32), salt: newSalt() },
    ben: { id: 'pk-ben', prf: randomBytes(32), salt: newSalt() },
    cara: { id: 'pk-cara', prf: randomBytes(32), salt: newSalt() },
  }
  const unlock = (k: { id: string; prf: Buffer; salt: string }, prf = k.prf) => vault.unlockWithPasskeyOrRegister(k.id, prf, k.salt, k.id)
  const box = (id: string) => db.query<{ pendingKey: string | null }>(`SELECT "pendingKey" FROM "VaultMailbox" WHERE "passkeyId" = '${id}'`)
  const wrap = (id: string) => db.query(`SELECT 1 FROM "VaultKeyWrap" WHERE "passkeyId" = '${id}'`).length === 1

  beforeAll(async () => {
    db = createTestDb()
    db.exec(`
      INSERT INTO "Person" ("id","name") VALUES ('p-owner','Owner'), ('p-anna','Anna'), ('p-ben','Ben'), ('p-cara','Cara');
      INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES
        ('pk-owner','p-owner','c1',X'00','Mac'), ('pk-anna','p-anna','c2',X'00','iPhone'),
        ('pk-ben','p-ben','c3',X'00','iPad'), ('pk-cara','p-cara','c4',X'00','Pixel');
    `)
    usePrismaOn(db)
    vault = await import('../vault')
    await vault.createVault(keys.owner.id, keys.owner.prf, keys.owner.salt, 'Owner, Mac')
    vault.lock()
  })
  afterAll(async () => {
    vault.lock()
    await releasePrisma()
    db.cleanup()
  })

  it('a passkey with its own copy opens as before, and a wrong PRF output does not', async () => {
    expect(await unlock(keys.owner, randomBytes(32))).toBe('wrong-key')
    expect(await unlock(keys.owner)).toBe('opened')
    expect((await vault.status()).open).toBe(true)
    vault.lock()
  })

  it('locked with nothing: its mailbox is stored and the answer is pending; asking again keeps one', async () => {
    expect(await unlock(keys.anna)).toBe('pending')
    expect(await unlock(keys.anna)).toBe('pending')
    expect(db.query(`SELECT COUNT(*) AS n FROM "VaultMailbox"`)).toEqual([{ n: 1 }])
    expect(box('pk-anna')[0].pendingKey).toBeNull()
    expect(wrap('pk-anna')).toBe(false)
    expect((await vault.status()).open).toBe(false)
    expect((await vault.status()).waiting).toEqual(['pk-anna'])
    // Another PRF output (another authenticator) is not this mailbox's
    expect(await unlock(keys.anna, randomBytes(32))).toBe('wrong-key')
  })

  it('someone else opening the vault leaves a pending copy for every waiting passkey', async () => {
    expect(await unlock(keys.ben)).toBe('pending')
    expect(await unlock(keys.owner)).toBe('opened')
    expect(box('pk-anna')[0].pendingKey).toMatch(/^[\w-]{43}\.v1\./)
    expect(box('pk-ben')[0].pendingKey).toMatch(/^[\w-]{43}\.v1\./)
    // The pending copy is not the vault key itself
    expect(box('pk-anna')[0].pendingKey).not.toBe(box('pk-ben')[0].pendingKey)
    vault.lock()
  })

  it('the waiting passkey then opens it, and is converted to a normal copy with no mailbox left', async () => {
    expect(await unlock(keys.anna)).toBe('converted')
    expect((await vault.status()).open).toBe(true)
    expect(wrap('pk-anna')).toBe(true)
    expect(box('pk-anna')).toHaveLength(0)
    vault.lock()
    // From now on it opens like any passkey, with the same salt
    expect(await unlock(keys.anna)).toBe('opened')
    expect((await vault.status()).openedBy).toBe('pk-anna')
    vault.lock()
    expect(box('pk-ben')).toHaveLength(1)
  })

  it('with the vault already open, a passkey with nothing gets its copy at once, and the vault stays open', async () => {
    expect(await unlock(keys.owner)).toBe('opened')
    expect(await unlock(keys.cara)).toBe('added')
    expect(wrap('pk-cara')).toBe(true)
    expect(box('pk-cara')).toHaveLength(0)
    // A waiting passkey, with the vault open, is added too
    expect(await unlock(keys.ben)).toBe('added')
    expect(wrap('pk-ben')).toBe(true)
    expect(box('pk-ben')).toHaveLength(0)
    vault.lock()
    expect(await unlock(keys.cara)).toBe('opened')
    expect(await unlock(keys.ben)).toBe('opened')
    vault.lock()
  })

  it('opening with the recovery key or a password also leaves copies', async () => {
    const dee = { id: 'pk-dee', prf: randomBytes(32), salt: newSalt() }
    db.exec(`INSERT INTO "Person" ("id","name") VALUES ('p-dee','Dee'); INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-dee','p-dee','c5',X'00','Watch')`)
    expect(await unlock(dee)).toBe('pending')
    const recovery = await vault.replaceRecoveryKey().catch(() => null)
    expect(recovery).toBeNull() // locked: no new recovery key
    expect(await unlock(keys.owner)).toBe('opened')
    const next = await vault.replaceRecoveryKey()
    expect(box('pk-dee')[0].pendingKey).not.toBeNull()
    vault.lock()
    expect(await vault.unlockWithRecovery(next, 'x')).toBe(true)
    vault.lock()
    expect(await unlock(dee)).toBe('converted')
    vault.lock()
  })

  it('revoking a passkey takes its mailbox and pending copy with it', async () => {
    const eve = { id: 'pk-eve', prf: randomBytes(32), salt: newSalt() }
    db.exec(`INSERT INTO "Person" ("id","name") VALUES ('p-eve','Eve'); INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-eve','p-eve','c6',X'00','Old phone')`)
    expect(await unlock(eve)).toBe('pending')
    expect(await unlock(keys.owner)).toBe('opened')
    expect(box('pk-eve')[0].pendingKey).not.toBeNull()
    vault.lock()
    const { revokePasskey } = await import('@/lib/auth/household')
    expect(await revokePasskey('pk-eve')).toBe('ok')
    expect(box('pk-eve')).toHaveLength(0)
    expect(db.query(`SELECT COUNT(*) AS n FROM "VaultMailbox"`)).toEqual([{ n: 0 }])
  })

  it('starting the vault over drops pending copies of the old key but keeps the waiting passkeys', async () => {
    const fay = { id: 'pk-fay', prf: randomBytes(32), salt: newSalt() }
    db.exec(`INSERT INTO "Person" ("id","name") VALUES ('p-fay','Fay'); INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('pk-fay','p-fay','c7',X'00','Tablet')`)
    expect(await unlock(fay)).toBe('pending')
    expect(await unlock(keys.owner)).toBe('opened')
    expect(box('pk-fay')[0].pendingKey).not.toBeNull()
    await vault.resetVault()
    expect(box('pk-fay')).toEqual([{ pendingKey: null }])
    // A new vault made by the owner leaves a copy for it
    await vault.createVault(keys.owner.id, keys.owner.prf, keys.owner.salt, 'Owner, Mac')
    expect(box('pk-fay')[0].pendingKey).not.toBeNull()
    vault.lock()
    expect(await unlock(fay)).toBe('converted')
  })
})
