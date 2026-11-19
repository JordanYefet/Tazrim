import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth/config'
import { clearedSessionCookie, endSession } from '@/lib/auth/session'
import { relyingParty } from '@/lib/auth/webauthn'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: signs this browser out */
async function handlePOST(req: Request) {
  const jar = await cookies()
  await endSession(jar.get(SESSION_COOKIE)?.value)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(clearedSessionCookie(relyingParty(req.headers)?.secure ?? false))
  return res
}

export const POST = logged(handlePOST)
