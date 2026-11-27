/**
 * The vault (ENG-90): bank and card sign-ins, readable only while a household
 * member has opened it with their passkey (or the recovery key).
 *
 * The vault key lives only in this process's memory: nothing stored (the
 * database, env vars, files) can open it. It is wiped (zeroed) on "lock now",
 * after TAZRIM_VAULT_IDLE_MINUTES without use (15 by default), and on restart.
 */
import { prisma } from '@/lib/db/client'
import { getVaultIdleMinutes } from '@/lib/settings/app-settings'
import { checkOwnPassword } from '@/lib/auth/household'
import { keyFromPassword, keyFromPrf, keyFromRecovery, newMailbox, newPasswordKdf, newRecoveryKey, newVaultKey, open, openFromMailbox, openMailboxPrivate, passwordWrapAad, seal, sealToMailbox, wrapAad } from './crypto'

interface Unlocked {
  key: Buffer
  /** Who opened it, for the status line */
  by: string
  openedAt: number
  lastUsedAt: number
}

const g = globalThis as unknown as { __tazrimVault?: { open: Unlocked | null; timer?: ReturnType<typeof setInterval> } }
const state = (g.__tazrimVault ??= { open: null })

export function idleMs(): number {
  return getVaultIdleMinutes() * 60 * 1000
}

/** Wipes the key from memory */
export function lock() {
  state.open?.key.fill(0)
  state.open = null
}

function expireIfIdle(now = Date.now()) {
  if (state.open && now - state.open.lastUsedAt > idleMs()) lock()
}

function setOpen(key: Buffer, by: string) {
  lock()
  const now = Date.now()
  state.open = { key, by, openedAt: now, lastUsedAt: now }
  // Locks on time even when nobody asks; unref so it never keeps the process (or a test) alive
  if (!state.timer) {
    state.timer = setInterval(() => expireIfIdle(), 30_000)
    state.timer.unref?.()
  }
}

/** The key while open (and counts as use), or null */
function key(): Buffer | null {
  expireIfIdle()
  if (!state.open) return null
  state.open.lastUsedAt = Date.now()
  return state.open.key
}

export class VaultLockedError extends Error {
  constructor() {
    super('הכספת נעולה')
  }
}

export interface VaultStatus {
  exists: boolean
  open: boolean
  openedBy: string | null
  openedAt: string | null
  /** When it locks if nobody uses it */
  locksAt: string | null
  hasRecoveryKey: boolean
  /** Passkey ids that have their own copy */
  passkeys: string[]
  /** People (ids) who have a password copy (ENG-135) */
  passwords: string[]
  /** Passkey ids with no copy yet that are waiting for the next opening (ENG-140) */
  waiting: string[]
}

export async function status(): Promise<VaultStatus> {
  expireIfIdle()
  const [wraps, boxes] = await Promise.all([
    prisma.vaultKeyWrap.findMany({ select: { passkeyId: true, personId: true } }),
    prisma.vaultMailbox.findMany({ select: { passkeyId: true } }),
  ])
  const o = state.open
  return {
    exists: wraps.length > 0,
    open: !!o,
    openedBy: o?.by ?? null,
    openedAt: o ? new Date(o.openedAt).toISOString() : null,
    locksAt: o ? new Date(o.lastUsedAt + idleMs()).toISOString() : null,
    hasRecoveryKey: wraps.some(w => w.passkeyId === null && w.personId === null),
    passkeys: wraps.flatMap(w => (w.passkeyId ? [w.passkeyId] : [])),
    passwords: wraps.flatMap(w => (w.personId ? [w.personId] : [])),
    waiting: boxes.map(b => b.passkeyId),
  }
}

/**
 * First use: a new vault key, a copy for this passkey and one for a new
 * recovery key (returned, to show once). The vault is left open.
 */
export async function createVault(passkeyId: string, prfOutput: Buffer, prfSalt: string, by: string): Promise<string | 'exists'> {
  const vaultKey = newVaultKey()
  const recovery = newRecoveryKey()
  const created = await prisma.$transaction(async tx => {
    if ((await tx.vaultKeyWrap.count()) > 0) return false
    await tx.vaultKeyWrap.create({ data: { passkeyId, prfSalt, wrappedKey: seal(keyFromPrf(prfOutput, prfSalt), vaultKey, wrapAad(passkeyId)) } })
    await tx.vaultKeyWrap.create({ data: { passkeyId: null, wrappedKey: seal(keyFromRecovery(recovery), vaultKey, wrapAad(null)) } })
    // It has a real copy now: no mailbox needed
    await tx.vaultMailbox.deleteMany({ where: { passkeyId } })
    return true
  })
  if (!created) {
    vaultKey.fill(0)
    return 'exists'
  }
  await opened(vaultKey, by)
  return recovery
}

/** Opens the vault with a passkey's PRF output; false when it doesn't open this passkey's copy */
export async function unlockWithPasskey(passkeyId: string, prfOutput: Buffer, by: string): Promise<boolean> {
  const wrap = await prisma.vaultKeyWrap.findUnique({ where: { passkeyId } })
  if (!wrap?.prfSalt) return false
  const vaultKey = open(keyFromPrf(prfOutput, wrap.prfSalt), wrap.wrappedKey, wrapAad(passkeyId))
  if (!vaultKey) return false
  await opened(vaultKey, by)
  return true
}

/** The vault was just opened by someone: wipes nothing, and leaves a copy in every waiting passkey's mailbox (ENG-140) */
async function opened(key: Buffer, by: string) {
  setOpen(key, by)
  await fulfilMailboxes(key)
}

/**
 * ENG-140: for every passkey that has a mailbox and no copy, seals the vault key to its public key and
 * keeps it as the pending copy. Needs the vault open (someone just opened it), so it never runs without
 * the key. Never throws: opening the vault never fails because of it.
 *
 * A compromised app could plant its own mailbox public key and receive the vault key at the next
 * opening. But code running in the app already sees the vault key while it is open, so this adds no
 * capability. Mailboxes are only made from a real PRF ceremony of a registered passkey of a household
 * member (registerMailbox, reached only from the signed passkey answer in /api/vault/passkey).
 */
async function fulfilMailboxes(key: Buffer) {
  try {
    const boxes = await prisma.vaultMailbox.findMany({ where: { pendingKey: null }, select: { id: true, passkeyId: true, publicKey: true } })
    for (const box of boxes) {
      const pendingKey = sealToMailbox(box.publicKey, key, box.passkeyId)
      await prisma.vaultMailbox.updateMany({ where: { id: box.id, pendingKey: null }, data: { pendingKey } })
    }
  } catch {
    // opening the vault never fails because of a mailbox
  }
}

export type PasskeyUnlock =
  /** Its own copy opened the vault */
  | 'opened'
  /** A copy left in its mailbox opened the vault, and was replaced by a normal copy */
  | 'converted'
  /** The vault was already open: this passkey now has its own copy (the vault stays as it was) */
  | 'added'
  /** Nothing to open with yet: its mailbox is registered, and the next opening leaves it a copy */
  | 'pending'
  /** A PRF output that does not open this passkey's copy or mailbox */
  | 'wrong-key'

/**
 * A passkey's ceremony for "unlock" (ENG-140): opens the vault the way this passkey can, or, when it
 * can't yet, makes sure it will be able to next time.
 *   copy of its own → open;  a copy waiting in its mailbox → open, then a normal copy replaces it;
 *   vault already open → a normal copy right away;  otherwise → its mailbox is made (or kept).
 * `prfSalt` is the salt this ceremony asked for (the stored one when there is a copy or a mailbox).
 */
export async function unlockWithPasskeyOrRegister(passkeyId: string, prfOutput: Buffer, prfSalt: string, by: string): Promise<PasskeyUnlock> {
  if (await prisma.vaultKeyWrap.findUnique({ where: { passkeyId }, select: { id: true } })) {
    return (await unlockWithPasskey(passkeyId, prfOutput, by)) ? 'opened' : 'wrong-key'
  }
  const box = await prisma.vaultMailbox.findUnique({ where: { passkeyId } })
  if (box) {
    // The salt this passkey's PRF output was asked with must be the mailbox's, or it opens nothing
    const priv = openMailboxPrivate(passkeyId, box.sealedPrivate, prfOutput, box.prfSalt)
    if (!priv) return 'wrong-key'
    try {
      if (key()) {
        await addPasskey(passkeyId, prfOutput, box.prfSalt)
        return 'added'
      }
      const vaultKey = box.pendingKey ? openFromMailbox(priv, box.pendingKey, passkeyId) : null
      if (!vaultKey) return 'pending'
      await opened(vaultKey, by)
      await addPasskey(passkeyId, prfOutput, box.prfSalt)
      return 'converted'
    } finally {
      priv.fill(0)
    }
  }
  if (key()) {
    await addPasskey(passkeyId, prfOutput, prfSalt)
    return 'added'
  }
  const mailbox = newMailbox(passkeyId, prfOutput, prfSalt)
  await prisma.vaultMailbox.upsert({ where: { passkeyId }, create: { passkeyId, prfSalt, ...mailbox }, update: {} })
  return 'pending'
}

/** Opens the vault with the recovery key; false when it's wrong */
export async function unlockWithRecovery(recoveryKey: unknown, by: string): Promise<boolean> {
  if (typeof recoveryKey !== 'string' || !recoveryKey.trim()) return false
  const wrap = await prisma.vaultKeyWrap.findFirst({ where: { passkeyId: null, personId: null } })
  if (!wrap) return false
  const vaultKey = open(keyFromRecovery(recoveryKey), wrap.wrappedKey, wrapAad(null))
  if (!vaultKey) return false
  await opened(vaultKey, by)
  return true
}

/** While open: a copy for another passkey (replacing its old one) */
export async function addPasskey(passkeyId: string, prfOutput: Buffer, prfSalt: string) {
  const k = key()
  if (!k) throw new VaultLockedError()
  const wrappedKey = seal(keyFromPrf(prfOutput, prfSalt), k, wrapAad(passkeyId))
  await prisma.$transaction([
    prisma.vaultKeyWrap.upsert({ where: { passkeyId }, create: { passkeyId, prfSalt, wrappedKey }, update: { prfSalt, wrappedKey } }),
    // A passkey with its own copy needs no mailbox (ENG-140)
    prisma.vaultMailbox.deleteMany({ where: { passkeyId } }),
  ])
}

/** While open: a new recovery key (returned once); the old one stops working */
export async function replaceRecoveryKey(): Promise<string> {
  const k = key()
  if (!k) throw new VaultLockedError()
  const recovery = newRecoveryKey()
  const wrappedKey = seal(keyFromRecovery(recovery), k, wrapAad(null))
  await prisma.$transaction([
    prisma.vaultKeyWrap.deleteMany({ where: { passkeyId: null, personId: null } }),
    prisma.vaultKeyWrap.create({ data: { passkeyId: null, wrappedKey } }),
  ])
  return recovery
}

export type EnablePasswordResult = 'ok' | 'wrong-password' | 'no-password'

/**
 * While open: a copy of the vault key for this person under a key from their sign-in password
 * (ENG-135). The password must match the one they sign in with. It is used and dropped.
 */
export async function enablePasswordUnlock(personId: string, password: unknown): Promise<EnablePasswordResult> {
  const k = key()
  if (!k) throw new VaultLockedError()
  if (typeof password !== 'string' || !password) return 'wrong-password'
  if (!(await checkOwnPassword(personId, password))) {
    return (await prisma.person.findUnique({ where: { id: personId }, select: { passwordHash: true } }))?.passwordHash ? 'wrong-password' : 'no-password'
  }
  await wrapWithPassword(personId, password, k)
  await prisma.person.updateMany({ where: { id: personId }, data: { vaultPasswordOff: false } })
  return 'ok'
}

async function wrapWithPassword(personId: string, password: string, vaultKey: Buffer) {
  const kdf = newPasswordKdf()
  const derived = (await keyFromPassword(password, kdf))!
  const wrappedKey = seal(derived, vaultKey, passwordWrapAad(personId))
  derived.fill(0)
  await prisma.vaultKeyWrap.upsert({ where: { personId }, create: { personId, kdf, wrappedKey }, update: { kdf, wrappedKey } })
}

/** Opens the vault with a person's password; false when they have no copy or it doesn't open it */
export async function unlockWithPassword(personId: string, password: unknown, by: string): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false
  const wrap = await prisma.vaultKeyWrap.findUnique({ where: { personId } })
  if (!wrap?.kdf) return false
  const derived = await keyFromPassword(password, wrap.kdf)
  if (!derived) return false
  const vaultKey = open(derived, wrap.wrappedKey, passwordWrapAad(personId))
  derived.fill(0)
  if (!vaultKey) return false
  await opened(vaultKey, by)
  return true
}

/** Turns "open with my password" off: removes this person's copy, and it stays off (sign-ins no longer remake it) */
export async function disablePasswordUnlock(personId: string) {
  await prisma.$transaction([
    prisma.vaultKeyWrap.deleteMany({ where: { personId } }),
    prisma.person.updateMany({ where: { id: personId }, data: { vaultPasswordOff: true } }),
  ])
}

/** Does this person have a copy under their password? (Their own state only.) */
export async function hasPasswordCopy(personId: string): Promise<boolean> {
  return !!(await prisma.vaultKeyWrap.findUnique({ where: { personId }, select: { id: true } }))
}

async function optedOut(personId: string): Promise<boolean> {
  return !!(await prisma.person.findUnique({ where: { id: personId }, select: { vaultPasswordOff: true } }))?.vaultPasswordOff
}

/**
 * A person's correct sign-in password was just seen (the caller checked it): while the vault is
 * open, and they did not turn this off, their copy is made when it is missing, so the password
 * opens the vault from then on without a step in Settings (ENG-139). Never throws, and the
 * password goes nowhere else.
 */
export async function passwordSeen(personId: string, password: string): Promise<void> {
  try {
    const k = key()
    if (!k || typeof password !== 'string' || !password) return
    if (await hasPasswordCopy(personId)) return
    if (await optedOut(personId)) return
    await wrapWithPassword(personId, password, k)
  } catch {
    // signing in never fails because of this
  }
}

/**
 * After a person's password was set or changed: while the vault is open their copy is made again
 * under the new password, or made now when they had none (unless they turned it off); while it is
 * locked a copy can't be re-made, so an old one is deleted (the next password sign-in with the
 * vault open makes it). Removing the password removes the copy too (`password` null), without
 * counting as turning it off.
 */
export async function passwordChanged(personId: string, password: string | null) {
  if (!password) {
    await prisma.vaultKeyWrap.deleteMany({ where: { personId } })
    return
  }
  const had = await hasPasswordCopy(personId)
  if (!had && (await optedOut(personId))) return
  const k = key()
  if (k) {
    try {
      return await wrapWithPassword(personId, password, k)
    } catch {
      // never leave a copy that the old password still opens
    }
  }
  await prisma.vaultKeyWrap.deleteMany({ where: { personId } })
}

/**
 * When every key is lost: deletes the vault and the sign-ins in it, to set it
 * up again from a passkey. Accounts and transactions are untouched; the sign-ins
 * are typed in again.
 */
export async function resetVault() {
  lock()
  await prisma.$transaction([
    prisma.bankCredential.deleteMany(),
    prisma.vaultKeyWrap.deleteMany(),
    // Waiting passkeys stay (they are about the passkey), but a copy sealed to them was of the old key
    prisma.vaultMailbox.updateMany({ data: { pendingKey: null } }),
  ])
}

// ── Sign-ins ────────────────────────────────────────────────────────────

export type LoginFields = Record<string, string>

const credentialAad = (id: string) => `credential:${id}`

export interface CredentialSummary {
  id: string
  company: string
  label: string
  accountId: string | null
  updatedAt: string
}

/** What's stored, without any secret: readable while locked */
export async function listCredentials(): Promise<CredentialSummary[]> {
  const rows = await prisma.bankCredential.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  return rows.map(r => ({ id: r.id, company: r.company, label: r.label, accountId: r.accountId, updatedAt: r.updatedAt.toISOString() }))
}

export async function saveCredential(input: { id?: string; company: string; label: string; accountId: string | null; fields: LoginFields }) {
  const k = key()
  if (!k) throw new VaultLockedError()
  const id = input.id ?? crypto.randomUUID()
  const sealed = seal(k, Buffer.from(JSON.stringify(input.fields), 'utf8'), credentialAad(id))
  const data = { company: input.company, label: input.label, accountId: input.accountId, sealed }
  return input.id
    ? prisma.bankCredential.update({ where: { id }, data, select: { id: true } })
    : prisma.bankCredential.create({ data: { id, ...data }, select: { id: true } })
}

/** The stored fields, for the sync only (never sent to a browser) */
export async function readCredential(id: string): Promise<LoginFields | null> {
  const k = key()
  if (!k) throw new VaultLockedError()
  const row = await prisma.bankCredential.findUnique({ where: { id } })
  if (!row) return null
  const plain = open(k, row.sealed, credentialAad(row.id))
  return plain ? (JSON.parse(plain.toString('utf8')) as LoginFields) : null
}

export async function deleteCredential(id: string): Promise<boolean> {
  if (!key()) throw new VaultLockedError()
  const { count } = await prisma.bankCredential.deleteMany({ where: { id } })
  return count === 1
}
