import { NextResponse } from 'next/server'
import { isAuthRequired } from '@/lib/auth/config'
import { confirmSignedInPerson, type ConfirmProof } from '@/lib/auth/confirm'
import { relyingParty } from '@/lib/auth/webauthn'
import { PRIVACY_COOKIE, formatPrivacyCookie } from '@/lib/privacy'

export const dynamic = 'force-dynamic'

/**
 * Privacy mode (ENG-127, lib/privacy.ts) for this browser. Body: { on: true } hides the
 * amounts at once. { on: false } shows them again, and with the login on (ENG-89) only
 * after the signed-in person confirms: { flowId, response } from their passkey
 * (POST ./options) or { password }. So someone else holding the phone can't simply
 * turn it off.
 *
 * The cookie is httpOnly: the page can't clear it, only this route. It saves nothing
 * else, so the read-only demo allows it (lib/read-only.ts).
 *
 * 200 { on }; 400 for a body without on; 401/403 when not confirmed.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as (ConfirmProof & { on?: unknown }) | null
  if (typeof body?.on !== 'boolean') return NextResponse.json({ error: 'חסר on' }, { status: 400 })
  if (!body.on && isAuthRequired()) {
    const denied = await confirmSignedInPerson(req, body, 'privacy-off')
    if (denied) return denied
  }
  const res = NextResponse.json({ on: body.on })
  res.cookies.set({
    name: PRIVACY_COOKIE,
    value: formatPrivacyCookie(body.on),
    httpOnly: true,
    sameSite: 'lax',
    secure: relyingParty(req.headers)?.secure ?? false,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
