import { NextResponse } from 'next/server'
import { allow, fail, passwordTransportOr400, rpOr400, signedIn, TOO_MANY } from '@/lib/auth/http'
import { checkPassword } from '@/lib/auth/household'
import { createSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/** POST { name, password }: signs in with a person's password (set in Settings → People) */
export async function POST(req: Request) {
  if (!allow(req, 'password', 10, 15 * 60 * 1000)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const insecure = passwordTransportOr400(req, rp)
  if (insecure) return insecure
  const body = (await req.json().catch(() => null)) as { name?: unknown; password?: unknown } | null
  const person = await checkPassword(body?.name, body?.password)
  if (!person) return fail(401, 'השם או הסיסמה שגויים', 'BAD_PASSWORD')
  const token = await createSession(person.id, null)
  return signedIn({ ok: true }, token, rp)
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 })
}
