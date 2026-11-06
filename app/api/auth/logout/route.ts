import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth/config'
import { clearedSessionCookie, endSession } from '@/lib/auth/session'
import { relyingParty } from '@/lib/auth/webauthn'

export const dynamic = 'force-dynamic'

/** POST: signs this browser out */
export async function POST(req: Request) {
  const jar = await cookies()
  await endSession(jar.get(SESSION_COOKIE)?.value)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(clearedSessionCookie(relyingParty(req.headers)?.secure ?? false))
  return res
}
