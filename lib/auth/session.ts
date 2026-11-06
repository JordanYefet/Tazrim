import { prisma } from '@/lib/db/client'
import { SESSION_COOKIE, SESSION_IDLE_MS, SESSION_TOUCH_MS } from './config'
import { hashToken, randomToken } from './tokens'

export interface SignedIn {
  sessionId: string
  personId: string
  personName: string
  passkeyId: string | null
}

/** Opens a session and returns the cookie token (only its hash is stored). */
export async function createSession(personId: string, passkeyId: string | null): Promise<string> {
  const token = randomToken()
  await prisma.session.create({ data: { tokenHash: hashToken(token), personId, passkeyId } })
  return token
}

/**
 * The session a cookie token belongs to, or null: unknown, revoked (its
 * passkey or person was deleted, which cascades) or idle past SESSION_IDLE_MS.
 */
export async function readSession(token: string | undefined, now = new Date()): Promise<SignedIn | null> {
  if (!token) return null
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: { select: { name: true } } },
  })
  if (!row) return null
  const idle = now.getTime() - row.lastSeenAt.getTime()
  if (idle > SESSION_IDLE_MS) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {})
    return null
  }
  if (idle > SESSION_TOUCH_MS) {
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: now } }).catch(() => {})
  }
  return { sessionId: row.id, personId: row.personId, personName: row.person.name, passkeyId: row.passkeyId }
}

export async function endSession(token: string | undefined) {
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

/**
 * The Set-Cookie options: httpOnly, Lax, no Max-Age (gone when the browser
 * closes, the owner's choice), Secure whenever the page came over HTTPS.
 */
export function sessionCookie(token: string, secure: boolean) {
  return { name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: 'lax' as const, secure, path: '/' }
}

export function clearedSessionCookie(secure: boolean) {
  return { ...sessionCookie('', secure), maxAge: 0 }
}
