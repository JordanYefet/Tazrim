import { NextResponse } from 'next/server'
import { allow, fail, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { findInvite } from '@/lib/auth/household'
import { registrationOptions } from '@/lib/auth/webauthn'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { mode: 'invite', token }: a one-time challenge to create a passkey
 * before anyone is signed in, from a link for another device of someone already
 * in the household.
 *
 * Nobody joins with a passkey alone (ENG-119): first-run setup (/api/auth/setup)
 * and a new person's invite (/api/auth/invite) take a name and a password, and a
 * passkey is added after, signed in (/api/people/devices).
 */
async function handlePOST(req: Request) {
  if (!allow(req, 'register', 10)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const body = (await req.json().catch(() => null)) as { mode?: unknown; token?: unknown } | null

  if (body?.mode === 'setup') return fail(400, 'מתחילים עם שם וסיסמה. מפתח אפשר להוסיף אחר כך', 'PASSWORD_FIRST')

  if (body?.mode === 'invite') {
    const invite = await findInvite(body.token)
    if (!invite) return fail(410, 'הקישור פג תוקף או שכבר נוצל. בקשו קישור חדש', 'INVITE_GONE')
    if (!invite.person) return fail(400, 'מצטרפים עם שם וסיסמה. מפתח אפשר להוסיף אחר כך', 'PASSWORD_FIRST')
    const flow = { kind: 'invite' as const, inviteId: invite.id, personId: invite.person.id }
    return NextResponse.json(await registrationOptions(rp, flow, invite.person.name))
  }

  return fail(400, 'בקשה לא תקינה', 'BAD_REQUEST')
}

export const POST = logged(handlePOST)
