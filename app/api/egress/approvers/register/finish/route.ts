import { NextResponse } from 'next/server'
import { adminRefusal, allow, currentSession, passwordTransportOr400, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { checkOwnPassword } from '@/lib/auth/household'
import { prisma } from '@/lib/db/client'
import { egressRefusal } from '@/lib/egress/access'
import { relay } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

const refuse = (status: number, code: string) => NextResponse.json({ code, error: egressMessage(code) }, { status })

/**
 * POST { code, name, ... }: the code is the one typed from the file (recovery, ENG-141). 200 { ok, approver }. Keys-only in the log.
 * POST { token, assertion } or { token, source: 'signin-password', password }: the second half of add-approver: the
 * token came from the approval an existing approver signed, so there is no code and no file.
 * - { response }: a new passkey
 * - { password }: a new approval password (10 characters or more)
 * - { assertion }: the signed-in person's sign-in passkey, signing the challenge; `name` may be left out
 *   (it becomes "<passkey label> של <person>")
 * - { password, source: 'signin-password' }: the person's own sign-in password. It is checked here first
 *   and a wrong one is not relayed, so it does not spend the code's tries.
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  const body = (await req.json().catch(() => null)) as { code?: unknown; name?: unknown; response?: unknown; assertion?: unknown; password?: unknown; source?: unknown; token?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim().slice(0, 12) : ''
  const token = typeof body?.token === 'string' ? body.token.trim().slice(0, 100) : ''
  let name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : ''
  if (!code && !token) return refuse(400, 'INVALID')
  // With a token the updater has the name (made when the approval began); the code carries none
  const proofOf = (extra: Record<string, unknown>) => (token ? { token, ...extra } : { code, name, ...extra })

  const wantsAssertion = !!body?.assertion && typeof body.assertion === 'object'
  const signinPassword = body?.source === 'signin-password'
  if (wantsAssertion || signinPassword) {
    const session = await currentSession()
    if (!session) return refuse(401, 'SIGNED_OUT')
    if (wantsAssertion) {
      if (!name && !token) {
        const id = (body!.assertion as { id?: unknown }).id
        const key = typeof id === 'string' ? await prisma.passkey.findFirst({ where: { personId: session.personId, credentialId: id }, select: { label: true } }) : null
        name = key ? `${key.label} של ${session.personName}`.slice(0, 60) : session.personName.slice(0, 60)
      }
      const r = await relay('egress-register-finish', proofOf({ assertion: body!.assertion }))
      return NextResponse.json(r.body, { status: r.status })
    }
    const password = typeof body?.password === 'string' && body.password && body.password.length <= 500 ? body.password : null
    if (!password) return refuse(400, 'INVALID')
    const rp = rpOr400(req)
    if (rp instanceof NextResponse) return rp
    const insecure = passwordTransportOr400(req, rp)
    if (insecure) return insecure
    if (!allow(req, 'egress-password', 10, 15 * 60 * 1000)) return TOO_MANY()
    if (!(await checkOwnPassword(session.personId, password))) return refuse(403, 'BAD_PASSWORD')
    const r = await relay('egress-register-finish', token ? { token, password } : { code, name: name || session.personName.slice(0, 60), password })
    return NextResponse.json(r.body, { status: r.status })
  }

  const proof =
    body?.response && typeof body.response === 'object' ? { response: body.response } : typeof body?.password === 'string' && body.password && body.password.length <= 500 ? { password: body.password } : null
  if (token || !name || !proof) return refuse(400, 'INVALID')
  const r = await relay('egress-register-finish', { code, name, ...proof })
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
