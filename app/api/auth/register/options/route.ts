import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { allow, fail, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { checkSetupCode, cleanLabel, findInvite, hasPeople } from '@/lib/auth/household'
import { registrationOptions } from '@/lib/auth/webauthn'

export const dynamic = 'force-dynamic'

/**
 * POST: a one-time challenge to create a passkey, before anyone is signed in:
 *   { mode: 'setup', code, name }  first run, with the code from the server log
 *   { mode: 'invite', token, name } an invite link (name only for a new person)
 */
export async function POST(req: Request) {
  if (!allow(req, 'register', 10)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const body = (await req.json().catch(() => null)) as { mode?: unknown; code?: unknown; token?: unknown; name?: unknown } | null

  if (body?.mode === 'setup') {
    if (await hasPeople()) return fail(409, 'ההגדרה הראשונה כבר בוצעה', 'ALREADY_SET_UP')
    if (!checkSetupCode(body.code)) return fail(401, 'קוד ההגדרה שגוי', 'BAD_CODE')
    const name = cleanLabel(body.name, 'אני')
    return NextResponse.json(await registrationOptions(rp, { kind: 'setup', personId: randomUUID(), name }, name))
  }

  if (body?.mode === 'invite') {
    const invite = await findInvite(body.token)
    if (!invite) return fail(410, 'הקישור פג תוקף או שכבר נוצל. בקשו קישור חדש', 'INVITE_GONE')
    const person = invite.person ?? { id: randomUUID(), name: cleanLabel(body.name, 'בן/בת בית') }
    const flow = { kind: 'invite' as const, inviteId: invite.id, personId: person.id, name: person.name, isNewPerson: !invite.person }
    return NextResponse.json(await registrationOptions(rp, flow, person.name))
  }

  return fail(400, 'בקשה לא תקינה', 'BAD_REQUEST')
}
