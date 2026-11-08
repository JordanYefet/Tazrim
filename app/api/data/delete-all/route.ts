import { NextResponse } from 'next/server'
import { isAuthRequired } from '@/lib/auth/config'
import { clearedSessionCookie } from '@/lib/auth/session'
import { relyingParty } from '@/lib/auth/webauthn'
import { checkOwnPassword } from '@/lib/auth/household'
import { allow, currentSession, fail, TOO_MANY } from '@/lib/auth/http'
import { takeChallenge, verifyAuthentication } from '@/lib/auth/webauthn'
import { isLocalRequest } from '@/lib/local-request'
import { matchesDeleteAllPhrase } from '@/lib/data/delete-all-phrase'
import { wipeAllData } from '@/lib/db/wipe'

export const dynamic = 'force-dynamic'

interface Body {
  confirm?: unknown
  flowId?: unknown
  response?: unknown
  password?: unknown
}

/**
 * Deletes all data (ENG-62). Body: { confirm: "מחק הכל" } plus, with the login
 * on (ENG-89), proof that the signed-in person is at this device right now:
 * { flowId, response } from their passkey (POST ./options) or { password }.
 * With the login off (development), only from this machine, as before.
 *
 * The login goes with the data: everyone is signed out and the app opens at
 * /setup, with a new setup code in the server log.
 *
 * 400 for a wrong or missing phrase, 401/403 when not confirmed.
 * 200 { ok, deleted: { <table>: rows } }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null
  if (isAuthRequired()) {
    const denied = await confirmedOr403(req, body)
    if (denied) return denied
  } else if (!isLocalRequest(req.headers)) {
    return fail(403, 'אפשר למחוק את כל הנתונים רק מהמחשב שעליו האפליקציה רצה', 'NOT_LOCAL')
  }
  if (!matchesDeleteAllPhrase(body?.confirm)) {
    return fail(400, 'יש להקליד את ביטוי האישור כדי למחוק', 'CONFIRMATION_REQUIRED')
  }
  const deleted = await wipeAllData()
  const res = NextResponse.json({ ok: true, deleted })
  res.cookies.set(clearedSessionCookie(relyingParty(req.headers)?.secure ?? false))
  return res
}

/** Null when the signed-in person confirmed with their own passkey or password, else the error response */
async function confirmedOr403(req: Request, body: Body | null): Promise<NextResponse | null> {
  const session = await currentSession()
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  if (!allow(req, 'delete-all', 10, 15 * 60 * 1000)) return TOO_MANY()
  if (body?.password !== undefined) {
    if (await checkOwnPassword(session.personId, body.password)) return null
    return fail(403, 'הסיסמה שגויה', 'NOT_CONFIRMED')
  }
  const pending = takeChallenge(body?.flowId)
  if (!pending || pending.flow.kind !== 'confirm' || pending.flow.personId !== session.personId) {
    return fail(403, 'צריך לאשר עם המפתח או הסיסמה שלך', 'NOT_CONFIRMED')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passkey = await verifyAuthentication(pending, body?.response as any)
  if (!passkey || passkey.personId !== session.personId) return fail(403, 'המפתח לא אושר', 'NOT_CONFIRMED')
  return null
}
