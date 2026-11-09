import { NextResponse } from 'next/server'
import { currentSession, fail, rpOr400 } from '@/lib/auth/http'
import { registrationOptions } from '@/lib/auth/webauthn'

export const dynamic = 'force-dynamic'

/** POST: a challenge to add a passkey on this device for the signed-in person (e.g. after a recovery-code sign-in) */
export async function POST(req: Request) {
  const session = await currentSession()
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  return NextResponse.json(await registrationOptions(rp, { kind: 'device', personId: session.personId }, session.personName))
}
