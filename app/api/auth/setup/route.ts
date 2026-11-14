import { NextResponse } from 'next/server'
import { allow, fail, passwordTransportOr400, rpOr400, signedIn, TOO_MANY } from '@/lib/auth/http'
import { checkSetupCode, cleanLabel, clearSetupCode, createFirstPerson, hasPeople, newRecoveryCode } from '@/lib/auth/household'
import { passwordProblem } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { isThisComputer } from '@/lib/local-request'

export const dynamic = 'force-dynamic'

/**
 * POST { code, name, password }: first run (ENG-119). A name and a password,
 * always; a passkey can be added after (/api/people/devices). The setup code is
 * asked only from another device: on the computer itself (the "this computer"
 * door, never a header the client writes) it is not needed. Signs this browser
 * in and returns the recovery code, shown once.
 */
export async function POST(req: Request) {
  if (!allow(req, 'register', 10)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const insecure = passwordTransportOr400(req, rp)
  if (insecure) return insecure
  const body = (await req.json().catch(() => null)) as { code?: unknown; name?: unknown; password?: unknown } | null
  if (await hasPeople()) return fail(409, 'ההגדרה הראשונה כבר בוצעה', 'ALREADY_SET_UP')
  if (!isThisComputer(req.headers) && !checkSetupCode(body?.code)) return fail(401, 'קוד ההגדרה שגוי', 'BAD_CODE')
  const name = cleanLabel(body?.name, '')
  if (!name) return fail(400, 'צריך שם', 'NO_NAME')
  const problem = passwordProblem(body?.password)
  if (problem) return fail(400, problem, 'BAD_PASSWORD')
  const person = await createFirstPerson(name, body!.password as string)
  if (person === 'already-set-up') return fail(409, 'ההגדרה הראשונה כבר בוצעה', 'ALREADY_SET_UP')
  clearSetupCode()
  const token = await createSession(person.id, null)
  return signedIn({ ok: true, recoveryCode: await newRecoveryCode() }, token, rp)
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 })
}
