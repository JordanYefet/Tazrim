import { NextResponse } from 'next/server'
import { currentSession, fail, passwordTransportOr400, rpOr400 } from '@/lib/auth/http'
import { removePassword, setPassword } from '@/lib/auth/household'
import { passwordProblem } from '@/lib/auth/password'

export const dynamic = 'force-dynamic'

/** PUT { password }: sets or replaces the signed-in person's own password; their other password sign-ins end */
export async function PUT(req: Request) {
  const session = await currentSession()
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const insecure = passwordTransportOr400(req, rp)
  if (insecure) return insecure
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null
  const problem = passwordProblem(body?.password)
  if (problem) return fail(400, problem, 'WEAK_PASSWORD')
  const result = await setPassword(session.personId, body!.password as string, session.sessionId)
  if (result === 'name-taken') {
    return fail(409, 'לעוד מישהו בבית יש אותו שם, ובכניסה עם סיסמה מקלידים שם. שנו קודם את אחד השמות', 'NAME_TAKEN')
  }
  return NextResponse.json({ ok: true })
}

/** DELETE: removes the signed-in person's password (refused when it is the household's last way in) */
export async function DELETE() {
  const session = await currentSession()
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  const result = await removePassword(session.personId, session.sessionId)
  if (result === 'last-way-in') return fail(409, 'זו הדרך האחרונה להיכנס. הוסיפו מפתח לפני שמסירים את הסיסמה', 'LAST_WAY_IN')
  return NextResponse.json({ ok: true })
}
