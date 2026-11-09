/**
 * The household behind the login (ENG-89): the first-run setup code, the
 * recovery code, invite links, and the people and devices Settings lists.
 */
import { prisma } from '@/lib/db/client'
import { INVITE_TTL_MS } from './config'
import { burnPasswordCheck, hashPassword, verifyPassword } from './password'
import { hashToken, normalizeCode, randomToken, readableCode, sameHash } from './tokens'

const RECOVERY_KEY = 'auth.recoveryCodeHash'

export async function hasPeople(): Promise<boolean> {
  return (await prisma.person.count()) > 0
}

/**
 * First run: whoever reaches the server before anyone has signed up could
 * claim it, so setup asks for a code only the person who installed it knows:
 * TAZRIM_SETUP_CODE from `.env` (at least 8 characters), or else one printed
 * to the server's log (`docker compose logs tazrim`), kept in memory and
 * changed on restart.
 */
const g = globalThis as unknown as { __tazrimSetupCode?: string; __tazrimSetupNoticed?: boolean }

export const SETUP_CODE_MIN = 8

/** The code from `.env`, or null when unset or too short to guess safely */
export function configuredSetupCode(): string | null {
  const code = process.env.TAZRIM_SETUP_CODE?.trim()
  if (!code) return null
  if (code.length < SETUP_CODE_MIN) {
    if (!g.__tazrimSetupNoticed) console.warn(`[tazrim] TAZRIM_SETUP_CODE is shorter than ${SETUP_CODE_MIN} characters, so it is ignored`)
    g.__tazrimSetupNoticed = true
    return null
  }
  return code
}

/** Where the setup page tells the person to find the code */
export function setupCodeSource(): 'env' | 'log' {
  return configuredSetupCode() ? 'env' : 'log'
}

export function setupCode(): string {
  const configured = configuredSetupCode()
  if (configured) {
    if (!g.__tazrimSetupNoticed) console.log('[tazrim] First run: open /setup and type the TAZRIM_SETUP_CODE from .env')
    g.__tazrimSetupNoticed = true
    return configured
  }
  if (!g.__tazrimSetupCode) {
    g.__tazrimSetupCode = readableCode(2)
    console.log(`[tazrim] First-run setup code: ${g.__tazrimSetupCode} (open /setup in the browser)`)
  }
  return g.__tazrimSetupCode
}

export function checkSetupCode(input: unknown): boolean {
  const expected = configuredSetupCode() ?? g.__tazrimSetupCode
  if (typeof input !== 'string' || !expected) return false
  return sameHash(hashToken(normalizeCode(input)), hashToken(normalizeCode(expected)))
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

/** Settings → People: everyone, their devices and whether they have a password, oldest first. */
export async function listPeople() {
  const people = await prisma.person.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      passwordHash: true,
      passkeys: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, label: true, createdAt: true, lastUsedAt: true },
      },
    },
  })
  return people.map(({ passwordHash, ...p }) => ({ ...p, hasPassword: passwordHash !== null }))
}

/** A name as typed at sign-in: trimmed, spaces collapsed, any case */
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export type SetPasswordResult = 'ok' | 'name-taken'

/**
 * Sets (or replaces) a person's password. Sign-in asks for the name too, so it
 * must tell people apart: refused while someone else has the same name. Other
 * password sign-ins of this person end, except `keepSessionId` (this browser).
 */
export async function setPassword(personId: string, password: string, keepSessionId?: string): Promise<SetPasswordResult> {
  const people = await prisma.person.findMany({ select: { id: true, name: true } })
  const me = people.find(p => p.id === personId)
  if (!me) return 'name-taken'
  if (people.some(p => p.id !== personId && nameKey(p.name) === nameKey(me.name))) return 'name-taken'
  const passwordHash = await hashPassword(password)
  await prisma.$transaction([
    prisma.person.updateMany({ where: { id: personId }, data: { passwordHash } }),
    endPasswordSessions(personId, keepSessionId),
  ])
  return 'ok'
}

export type RemovePasswordResult = 'ok' | 'no-password' | 'last-way-in'

/** Removes a person's password; refused when it is the household's last way in (no passkey left anywhere). */
export async function removePassword(personId: string, keepSessionId?: string): Promise<RemovePasswordResult> {
  return prisma.$transaction(async tx => {
    const person = await tx.person.findUnique({ where: { id: personId }, select: { passwordHash: true } })
    if (!person?.passwordHash) return 'no-password'
    const otherPasswords = await tx.person.count({ where: { id: { not: personId }, passwordHash: { not: null } } })
    if ((await tx.passkey.count()) === 0 && otherPasswords === 0) return 'last-way-in'
    await tx.person.updateMany({ where: { id: personId }, data: { passwordHash: null } })
    await tx.session.deleteMany({ where: { personId, passkeyId: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } })
    return 'ok'
  })
}

/** Sessions that came from a password (or a recovery code): no passkey behind them */
function endPasswordSessions(personId: string, keepSessionId?: string) {
  return prisma.session.deleteMany({ where: { personId, passkeyId: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } })
}

/** The person a name and password belong to, or null. Takes as long for an unknown name. */
export async function checkPassword(name: unknown, password: unknown): Promise<{ id: string } | null> {
  if (typeof name !== 'string' || typeof password !== 'string' || !name.trim() || !password) return null
  const people = await prisma.person.findMany({ where: { passwordHash: { not: null } }, select: { id: true, name: true, passwordHash: true } })
  const match = people.find(p => nameKey(p.name) === nameKey(name))
  if (!match?.passwordHash) {
    await burnPasswordCheck(password)
    return null
  }
  return (await verifyPassword(password, match.passwordHash)) ? { id: match.id } : null
}

export type FirstPersonResult = { id: string } | 'already-set-up'

/** First run with a password instead of a passkey: the household's first person */
export async function createFirstPerson(name: string, password: string): Promise<FirstPersonResult> {
  const passwordHash = await hashPassword(password)
  return prisma.$transaction(async tx => {
    if ((await tx.person.count()) > 0) return 'already-set-up' as const
    return tx.person.create({ data: { name, passwordHash }, select: { id: true } })
  })
}

export async function hasOwnPassword(personId: string): Promise<boolean> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { passwordHash: true } })
  return !!person?.passwordHash
}

/** Does this signed-in person's password match? (Confirming a dangerous action.) */
export async function checkOwnPassword(personId: string, password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { passwordHash: true } })
  if (!person?.passwordHash) return false
  return verifyPassword(password, person.passwordHash)
}

export type RevokeResult = 'ok' | 'not-found' | 'last-passkey'

/**
 * Revokes a device: deletes the passkey, which deletes its sessions, so that
 * device's next request fails. The household's very last way in stays (its
 * last passkey, unless someone has a password), so nobody is locked out by a
 * mis-tap (the recovery code is the way back).
 */
export async function revokePasskey(id: string): Promise<RevokeResult> {
  return prisma.$transaction(async tx => {
    const passkey = await tx.passkey.findUnique({ where: { id }, select: { id: true } })
    if (!passkey) return 'not-found'
    const passwords = await tx.person.count({ where: { passwordHash: { not: null } } })
    if ((await tx.passkey.count()) <= 1 && passwords === 0) return 'last-passkey'
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
