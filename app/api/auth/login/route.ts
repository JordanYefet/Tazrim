import { NextResponse } from 'next/server'
import { allow, fail, signedIn, TOO_MANY } from '@/lib/auth/http'
import { createSession } from '@/lib/auth/session'
import { takeChallenge, verifyAuthentication } from '@/lib/auth/webauthn'

export const dynamic = 'force-dynamic'

/** POST { flowId, response }: the passkey's answer; signs this browser in */
export async function POST(req: Request) {
  if (!allow(req, 'login', 30)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { flowId?: unknown; response?: unknown } | null
  const pending = takeChallenge(body?.flowId)
  if (!pending || pending.flow.kind !== 'login') return fail(400, 'פג תוקף הבקשה. נסו שוב', 'EXPIRED')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passkey = await verifyAuthentication(pending, body?.response as any)
  if (!passkey) return fail(401, 'המפתח לא זוהה. אולי הוא בוטל, או שנוצר לכתובת אחרת', 'NOT_RECOGNISED')
  const token = await createSession(passkey.personId, passkey.id)
  return signedIn({ ok: true }, token, pending.rp)
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 })
}
