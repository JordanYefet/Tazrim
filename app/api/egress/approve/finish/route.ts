import { NextResponse } from 'next/server'
import { adminRefusal, allow, currentSession, passwordTransportOr400, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { checkOwnPassword } from '@/lib/auth/household'
import { egressRefusal } from '@/lib/egress/access'
import { relay } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { response } (a passkey answer) or { flowId, password }: the updater verifies it and applies
 * the change; 200 { ok, change, job? }. The password is never logged (this route is keys-only).
 *
 * ENG-141: { flowId, password, signin: true } is the first approval, where the password about to be
 * pinned must be the person's own sign-in password. It is checked here first (as register/finish
 * does), and a wrong one is not relayed. The updater cannot check it: it only knows the hash it pins.
 * Once an approver exists the updater ignores nothing here: a flow that is not a first approval
 * checks the password against the pinned one.
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  const body = (await req.json().catch(() => null)) as { response?: unknown; flowId?: unknown; password?: unknown; signin?: unknown } | null
  const passkey = body?.response && typeof body.response === 'object' ? { response: body.response } : null
  const password = typeof body?.flowId === 'string' && typeof body.password === 'string' && body.password && body.password.length <= 500 ? { flowId: body.flowId.slice(0, 200), password: body.password } : null
  const answer = passkey ?? password
  if (!answer) return NextResponse.json({ code: 'INVALID', error: egressMessage('INVALID') }, { status: 400 })
  if (!passkey && password && body?.signin === true) {
    const session = await currentSession()
    if (!session) return NextResponse.json({ code: 'SIGNED_OUT', error: egressMessage('SIGNED_OUT') }, { status: 401 })
    const rp = rpOr400(req)
    if (rp instanceof NextResponse) return rp
    const insecure = passwordTransportOr400(req, rp)
    if (insecure) return insecure
    if (!allow(req, 'egress-password', 10, 15 * 60 * 1000)) return TOO_MANY()
    if (!(await checkOwnPassword(session.personId, password.password))) return NextResponse.json({ code: 'BAD_PASSWORD', error: egressMessage('BAD_PASSWORD') }, { status: 403 })
  }
  const r = await relay('egress-approve-finish', answer)
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
