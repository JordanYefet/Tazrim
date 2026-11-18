import { NextResponse } from 'next/server'
import { relyingParty } from '@/lib/auth/webauthn'
import { PRIVACY_COOKIE, formatPrivacyCookie } from '@/lib/privacy'

export const dynamic = 'force-dynamic'

/**
 * Privacy mode (ENG-127, lib/privacy.ts) for this browser. Body: { on: boolean }.
 * Hiding and showing the amounts are both immediate: the owner chose not to ask for the
 * passkey or password to show them again.
 *
 * The cookie is httpOnly: only this route sets it. It saves nothing else, so the
 * read-only demo allows it (lib/read-only.ts).
 *
 * 200 { on }; 400 for a body without on.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null
  if (typeof body?.on !== 'boolean') return NextResponse.json({ error: 'חסר on' }, { status: 400 })
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
