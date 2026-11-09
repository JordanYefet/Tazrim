/**
 * The vault (ENG-90): bank and card sign-ins, readable only while a household
 * member has opened it with their passkey (or the recovery key).
 *
 * The vault key lives only in this process's memory: nothing stored (the
 * database, env vars, files) can open it. It is wiped (zeroed) on "lock now",
 * after TAZRIM_VAULT_IDLE_MINUTES without use (15 by default), and on restart.
 */
import { prisma } from '@/lib/db/client'
import { keyFromPrf, keyFromRecovery, newRecoveryKey, newVaultKey, open, seal, wrapAad } from './crypto'

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
  const minutes = Number(process.env.TAZRIM_VAULT_IDLE_MINUTES)
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60 * 1000
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
}

export async function status(): Promise<VaultStatus> {
  expireIfIdle()
  const wraps = await prisma.vaultKeyWrap.findMany({ select: { passkeyId: true } })
  const o = state.open
  return {
    exists: wraps.length > 0,
    open: !!o,
    openedBy: o?.by ?? null,
    openedAt: o ? new Date(o.openedAt).toISOString() : null,
    locksAt: o ? new Date(o.lastUsedAt + idleMs()).toISOString() : null,
    hasRecoveryKey: wraps.some(w => w.passkeyId === null),
    passkeys: wraps.flatMap(w => (w.passkeyId ? [w.passkeyId] : [])),
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
    return true
  })
  if (!created) {
    vaultKey.fill(0)
    return 'exists'
  }
  setOpen(vaultKey, by)
  return recovery
}

/** Opens the vault with a passkey's PRF output; false when it doesn't open this passkey's copy */
export async function unlockWithPasskey(passkeyId: string, prfOutput: Buffer, by: string): Promise<boolean> {
  const wrap = await prisma.vaultKeyWrap.findUnique({ where: { passkeyId } })
  if (!wrap?.prfSalt) return false
  const vaultKey = open(keyFromPrf(prfOutput, wrap.prfSalt), wrap.wrappedKey, wrapAad(passkeyId))
  if (!vaultKey) return false
  setOpen(vaultKey, by)
  return true
}

/** Opens the vault with the recovery key; false when it's wrong */
export async function unlockWithRecovery(recoveryKey: unknown, by: string): Promise<boolean> {
  if (typeof recoveryKey !== 'string' || !recoveryKey.trim()) return false
  const wrap = await prisma.vaultKeyWrap.findFirst({ where: { passkeyId: null } })
  if (!wrap) return false
  const vaultKey = open(keyFromRecovery(recoveryKey), wrap.wrappedKey, wrapAad(null))
  if (!vaultKey) return false
  setOpen(vaultKey, by)
  return true
}

/** While open: a copy for another passkey (replacing its old one) */
export async function addPasskey(passkeyId: string, prfOutput: Buffer, prfSalt: string) {
  const k = key()
  if (!k) throw new VaultLockedError()
  const wrappedKey = seal(keyFromPrf(prfOutput, prfSalt), k, wrapAad(passkeyId))
  await prisma.vaultKeyWrap.upsert({ where: { passkeyId }, create: { passkeyId, prfSalt, wrappedKey }, update: { prfSalt, wrappedKey } })
}

/** While open: a new recovery key (returned once); the old one stops working */
export async function replaceRecoveryKey(): Promise<string> {
  const k = key()
  if (!k) throw new VaultLockedError()
  const recovery = newRecoveryKey()
  const wrappedKey = seal(keyFromRecovery(recovery), k, wrapAad(null))
  await prisma.$transaction([
    prisma.vaultKeyWrap.deleteMany({ where: { passkeyId: null } }),
    prisma.vaultKeyWrap.create({ data: { passkeyId: null, wrappedKey } }),
  ])
  return recovery
}

/**
 * When every key is lost: deletes the vault and the sign-ins in it, to set it
 * up again from a passkey. Accounts and transactions are untouched; the sign-ins
 * are typed in again.
 */
export async function resetVault() {
  lock()
  await prisma.$transaction([prisma.bankCredential.deleteMany(), prisma.vaultKeyWrap.deleteMany()])
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
