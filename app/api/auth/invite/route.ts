import { NextResponse } from 'next/server'
import { allow, fail, passwordTransportOr400, rpOr400, signedIn, TOO_MANY } from '@/lib/auth/http'
import { cleanLabel, findInvite, joinWithPassword } from '@/lib/auth/household'
import { passwordProblem } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * POST { token, name, password }: joins the household from an invite link
 * with a password instead of a passkey (the passkey way is
 * /api/auth/register/options with mode 'invite'). New-person links only: a
 * link for another device of someone signs in with their password instead.
 */
export async function POST(req: Request) {
  if (!allow(req, 'register', 10)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const insecure = passwordTransportOr400(req, rp)
  if (insecure) return insecure
  const body = (await req.json().catch(() => null)) as { token?: unknown; name?: unknown; password?: unknown } | null
  const invite = await findInvite(body?.token)
  if (!invite) return fail(410, 'הקישור פג תוקף או שכבר נוצל. בקשו קישור חדש', 'INVITE_GONE')
  if (invite.person) return fail(400, 'הקישור הזה מוסיף מכשיר. במכשיר בלי מפתח נכנסים עם הסיסמה', 'DEVICE_INVITE')
  const problem = passwordProblem(body?.password)
  if (problem) return fail(400, problem, 'BAD_PASSWORD')
  const name = cleanLabel(body?.name, '')
  if (!name) return fail(400, 'צריך שם', 'NO_NAME')
  const person = await joinWithPassword(invite.id, name, body!.password as string)
  if (person === 'gone') return fail(410, 'הקישור פג תוקף או שכבר נוצל. בקשו קישור חדש', 'INVITE_GONE')
  if (person === 'name-taken') return fail(409, 'כבר יש בבית מישהו בשם הזה. בחרו שם אחר', 'NAME_TAKEN')
  const token = await createSession(person.id, null)
  return signedIn({ ok: true }, token, rp)
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 })
}
