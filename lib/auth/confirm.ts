import type { NextResponse } from 'next/server'
import { checkOwnPassword } from '@/lib/auth/household'
import { allow, currentSession, fail, TOO_MANY } from '@/lib/auth/http'
import { takeChallenge, verifyAuthentication } from '@/lib/auth/webauthn'

/** What a request sends to prove the signed-in person is at this device right now */
export interface ConfirmProof {
  /** From their passkey: the challenge's flowId (POST …/options, confirmOptions) and the passkey's answer */
  flowId?: unknown
  response?: unknown
  /** Or their own password */
  password?: unknown
}

/**
 * Null when the signed-in person confirmed with their own passkey or password (login on,
 * ENG-89), else the error response. Rate-limited per `action`: 10 tries in 15 minutes.
 * Used by deleting all data (ENG-62) and by showing amounts again in privacy mode (ENG-127).
 */
export async function confirmSignedInPerson(req: Request, body: ConfirmProof | null, action: string): Promise<NextResponse | null> {
  const session = await currentSession()
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  if (!allow(req, action, 10, 15 * 60 * 1000)) return TOO_MANY()
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
