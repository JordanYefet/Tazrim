import { NextResponse } from 'next/server'
import { allow, currentSession, fail, signedIn, TOO_MANY } from '@/lib/auth/http'
import { cleanLabel, clearSetupCode, consumeInvite, hasPeople, newRecoveryCode, savePasskey } from '@/lib/auth/household'
import { createSession } from '@/lib/auth/session'
import { takeChallenge, verifyRegistration } from '@/lib/auth/webauthn'

export const dynamic = 'force-dynamic'

/**
 * POST { flowId, response, label }: the browser's new passkey, for a challenge
 * from /api/auth/register/options (setup, invite) or /api/people/devices
 * (another device for the signed-in person). Setup and invites sign this
 * browser in; setup also returns the recovery code, shown once.
 */
export async function POST(req: Request) {
  if (!allow(req, 'register', 10)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { flowId?: unknown; response?: unknown; label?: unknown } | null
  const pending = takeChallenge(body?.flowId)
  if (!pending || pending.flow.kind === 'login' || pending.flow.kind === 'confirm' || pending.flow.kind === 'vault') return fail(400, 'פג תוקף הבקשה. נסו שוב', 'EXPIRED')
  const flow = pending.flow
  const label = cleanLabel(body?.label, 'מכשיר')

  // Checked again now: the state may have changed since the options were issued
  if (flow.kind === 'setup' && (await hasPeople())) return fail(409, 'ההגדרה הראשונה כבר בוצעה', 'ALREADY_SET_UP')
  if (flow.kind === 'device') {
    const session = await currentSession()
    if (!session || session.personId !== flow.personId) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cred = await verifyRegistration(pending, body?.response as any)
  if (!cred) return fail(400, 'יצירת המפתח נכשלה. נסו שוב', 'NOT_VERIFIED')
  if (flow.kind === 'invite' && !(await consumeInvite(flow.inviteId))) {
    return fail(410, 'הקישור פג תוקף או שכבר נוצל. בקשו קישור חדש', 'INVITE_GONE')
  }

  const isNew = flow.kind === 'setup' || (flow.kind === 'invite' && flow.isNewPerson)
  const name = flow.kind === 'setup' || flow.kind === 'invite' ? flow.name : ''
  const passkey = await savePasskey({ id: flow.personId, name, isNew }, cred, label)

  if (flow.kind === 'device') return NextResponse.json({ ok: true })
  const token = await createSession(flow.personId, passkey.id)
  if (flow.kind === 'setup') {
    clearSetupCode()
    return signedIn({ ok: true, recoveryCode: await newRecoveryCode() }, token, pending.rp)
  }
  return signedIn({ ok: true }, token, pending.rp)
}
