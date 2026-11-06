/**
 * The household behind the login (ENG-89): the first-run setup code, the
 * recovery code, invite links, and the people and devices Settings lists.
 */
import { prisma } from '@/lib/db/client'
import { INVITE_TTL_MS } from './config'
import { hashToken, normalizeCode, randomToken, readableCode, sameHash } from './tokens'

const RECOVERY_KEY = 'auth.recoveryCodeHash'

export async function hasPeople(): Promise<boolean> {
  return (await prisma.person.count()) > 0
}

/**
 * First run: whoever reaches the server before anyone has signed up could
 * claim it, so setup asks for a code printed only to the server's log
 * (`docker compose logs tazrim`). It lives in memory and changes on restart.
 */
const g = globalThis as unknown as { __tazrimSetupCode?: string }

export function setupCode(): string {
  if (!g.__tazrimSetupCode) {
    g.__tazrimSetupCode = readableCode(2)
    console.log(`[tazrim] First-run setup code: ${g.__tazrimSetupCode} (open /setup in the browser)`)
  }
  return g.__tazrimSetupCode
}

export function checkSetupCode(input: unknown): boolean {
  if (typeof input !== 'string' || !g.__tazrimSetupCode) return false
  return sameHash(hashToken(normalizeCode(input)), hashToken(normalizeCode(g.__tazrimSetupCode)))
}

export function clearSetupCode() {
  g.__tazrimSetupCode = undefined
}

/** A new recovery code: shown once, only its hash kept; the previous one stops working. */
export async function newRecoveryCode(): Promise<string> {
  const code = readableCode(5)
  const value = hashToken(normalizeCode(code))
  await prisma.setting.upsert({ where: { key: RECOVERY_KEY }, create: { key: RECOVERY_KEY, value }, update: { value } })
  return code
}

/**
 * Uses the recovery code: on a match it is deleted (it works once) and the
 * household's first person is returned, to sign in and add a new passkey.
 */
export async function useRecoveryCode(input: unknown): Promise<{ id: string } | null> {
  if (typeof input !== 'string' || !input.trim()) return null
  const row = await prisma.setting.findUnique({ where: { key: RECOVERY_KEY } })
  if (!row || !sameHash(row.value, hashToken(normalizeCode(input)))) return null
  // deleteMany so two requests racing with the same code can't both win
  const { count } = await prisma.setting.deleteMany({ where: { key: RECOVERY_KEY, value: row.value } })
  if (count !== 1) return null
  return prisma.person.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } })
}

export async function hasRecoveryCode(): Promise<boolean> {
  return !!(await prisma.setting.findUnique({ where: { key: RECOVERY_KEY } }))
}

/** A one-time invite link token: a new person (personId null) or another device for a person. */
export async function createInvite(personId: string | null, now = new Date()) {
  const token = randomToken(24)
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await prisma.invite.create({ data: { tokenHash: hashToken(token), personId, expiresAt } })
  return { token, expiresAt }
}

/** The invite a token opens, while unused and unexpired, with the person's name for an existing person. */
export async function findInvite(token: unknown, now = new Date()) {
  if (typeof token !== 'string' || !token) return null
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!invite || invite.usedAt || invite.expiresAt <= now) return null
  const person = invite.personId
    ? await prisma.person.findUnique({ where: { id: invite.personId }, select: { id: true, name: true } })
    : null
  if (invite.personId && !person) return null
  return { id: invite.id, person }
}

/** Marks an invite used; false when it already was (or expired meanwhile), so a link registers once. */
export async function consumeInvite(id: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.invite.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  return count === 1
}

/** Settings → People: everyone, their devices, oldest first. */
export async function listPeople() {
  return prisma.person.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      passkeys: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, label: true, createdAt: true, lastUsedAt: true },
      },
    },
  })
}

export type RevokeResult = 'ok' | 'not-found' | 'last-passkey'

/**
 * Revokes a device: deletes the passkey, which deletes its sessions, so that
 * device's next request fails. The household's very last passkey stays, so
 * nobody is locked out by a mis-tap (the recovery code is the way back).
 */
export async function revokePasskey(id: string): Promise<RevokeResult> {
  return prisma.$transaction(async tx => {
    const passkey = await tx.passkey.findUnique({ where: { id }, select: { id: true } })
    if (!passkey) return 'not-found'
    if ((await tx.passkey.count()) <= 1) return 'last-passkey'
    await tx.passkey.delete({ where: { id } })
    return 'ok'
  })
}

/** Saves a verified passkey for a person, creating the person first when new. */
export async function savePasskey(
  person: { id: string; name: string; isNew: boolean },
  cred: { credentialId: string; publicKey: Uint8Array; counter: number; transports: string | null },
  label: string
) {
  return prisma.$transaction(async tx => {
    if (person.isNew) await tx.person.create({ data: { id: person.id, name: person.name } })
    return tx.passkey.create({
      data: {
        personId: person.id,
        credentialId: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
        label,
      },
    })
  })
}

/** A device or person name as typed: trimmed, at most 40 characters, a fallback when empty */
export function cleanLabel(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : ''
  return s || fallback
}
