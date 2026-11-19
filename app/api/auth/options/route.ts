import { NextResponse } from 'next/server'
import { allow, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { authenticationOptions } from '@/lib/auth/webauthn'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: a one-time sign-in challenge (ENG-89) */
async function handlePOST(req: Request) {
  if (!allow(req, 'login', 30)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  return NextResponse.json(await authenticationOptions(rp))
}

export const POST = logged(handlePOST)
