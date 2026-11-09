import { NextResponse } from 'next/server'
import { allow, fail, rpOr400, signedIn, TOO_MANY } from '@/lib/auth/http'
import { useRecoveryCode } from '@/lib/auth/household'
import { createSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/** POST { code }: signs in once with the recovery code, which then stops working */
export async function POST(req: Request) {
  if (!allow(req, 'recover', 5, 15 * 60 * 1000)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null
  const person = await useRecoveryCode(body?.code)
  if (!person) return fail(401, 'קוד השחזור שגוי או שכבר נוצל', 'BAD_CODE')
  const token = await createSession(person.id, null)
  return signedIn({ ok: true }, token, rp)
}
