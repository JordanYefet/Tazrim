import { NextResponse } from 'next/server'
import { currentSession, fail, rpOr400 } from '@/lib/auth/http'
import { confirmOptions } from '@/lib/auth/webauthn'

export const dynamic = 'force-dynamic'

/**
 * POST: a challenge for the signed-in person's own passkey, to confirm
 * deleting all data. { passkey: null } when they have none (their password
 * confirms instead).
 */
export async function POST(req: Request) {
  const session = await currentSession()
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  return NextResponse.json({ passkey: await confirmOptions(rp, session.personId) })
}
