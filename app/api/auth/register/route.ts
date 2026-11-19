import { NextResponse } from 'next/server'
import { allow, currentSession, fail, signedIn, TOO_MANY } from '@/lib/auth/http'
import { cleanLabel, consumeInvite, linkSessionToPasskey, savePasskey } from '@/lib/auth/household'
import { createSession } from '@/lib/auth/session'
import { takeChallenge, verifyRegistration } from '@/lib/auth/webauthn'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { flowId, response, label }: the browser's new passkey, for a challenge
 * from /api/people/devices (this device, for the signed-in person: right after
 * setup or joining, or later from Settings) or /api/auth/register/options (an
 * invite link for another device of someone, which signs this browser in).
 * A password or recovery-code session that adds its own device's passkey
 * becomes that passkey's session, so Settings knows it as "this device".
 */
async function handlePOST(req: Request) {
  if (!allow(req, 'register', 10)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { flowId?: unknown; response?: unknown; label?: unknown } | null
  const pending = takeChallenge(body?.flowId)
  if (!pending || (pending.flow.kind !== 'invite' && pending.flow.kind !== 'device')) return fail(400, 'פג תוקף הבקשה. נסו שוב', 'EXPIRED')
  const flow = pending.flow
  const label = cleanLabel(body?.label, 'מכשיר')

  // Checked again now: the state may have changed since the options were issued
  const session = flow.kind === 'device' ? await currentSession() : null
  if (flow.kind === 'device' && (!session || session.personId !== flow.personId)) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cred = await verifyRegistration(pending, body?.response as any)
  if (!cred) return fail(400, 'יצירת המפתח נכשלה. נסו שוב', 'NOT_VERIFIED')
  if (flow.kind === 'invite' && !(await consumeInvite(flow.inviteId))) {
    return fail(410, 'הקישור פג תוקף או שכבר נוצל. בקשו קישור חדש', 'INVITE_GONE')
  }

  const passkey = await savePasskey(flow.personId, cred, label)
  if (session) {
    if (!session.passkeyId) await linkSessionToPasskey(session.sessionId, passkey.id)
    return NextResponse.json({ ok: true })
  }
  const token = await createSession(flow.personId, passkey.id)
  return signedIn({ ok: true }, token, pending.rp)
}

export const POST = logged(handlePOST)
