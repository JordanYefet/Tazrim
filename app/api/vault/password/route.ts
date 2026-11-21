import { NextResponse } from 'next/server'
import { allow, fail, passwordTransportOr400, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { isResponse, sessionOr401, whileOpen } from '@/lib/vault/http'
import { disablePasswordUnlock, enablePasswordUnlock, unlockWithPassword } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** Same limit as sign-in's password and the recovery key: 10 wrong or right tries in 15 minutes */
const tooMany = (req: Request) => !allow(req, 'vault-password', 10, 15 * 60 * 1000)

/** A password over plain http only where TAZRIM_REQUIRE_HTTPS allows it (as at sign-in); null when fine */
function transportProblem(req: Request) {
  const rp = rpOr400(req)
  return rp instanceof NextResponse ? rp : passwordTransportOr400(req, rp)
}

/**
 * The vault with a person's own password (ENG-135). The password is read, used to derive a key
 * and dropped: never stored, never logged (/api/vault/* logs request keys only).
 *
 * POST { password }: opens the vault with the signed-in person's password copy
 * PUT  { password }: turns it on while the vault is open: the password must be their sign-in one
 * DELETE:            turns it off (removes their copy)
 */
async function handlePOST(req: Request) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const insecure = transportProblem(req)
  if (insecure) return insecure
  if (tooMany(req)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null
  if (!(await unlockWithPassword(session.personId, body?.password, `${session.personName}, סיסמה`))) {
    return fail(403, 'הסיסמה שגויה, או שהיא לא מוגדרת לפתיחת הכספת', 'WRONG_KEY')
  }
  return NextResponse.json({ ok: true })
}

async function handlePUT(req: Request) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const insecure = transportProblem(req)
  if (insecure) return insecure
  if (tooMany(req)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null
  return whileOpen(async () => {
    const result = await enablePasswordUnlock(session.personId, body?.password)
    if (result === 'no-password') return fail(409, 'עוד אין לך סיסמה. מגדירים אותה בהגדרות ← אנשים', 'NO_PASSWORD')
    if (result === 'wrong-password') return fail(403, 'הסיסמה שגויה', 'NOT_CONFIRMED')
    return NextResponse.json({ ok: true })
  })
}

async function handleDELETE() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  await disablePasswordUnlock(session.personId)
  return NextResponse.json({ ok: true })
}

export const POST = logged(handlePOST)
export const PUT = logged(handlePUT)
export const DELETE = logged(handleDELETE)
