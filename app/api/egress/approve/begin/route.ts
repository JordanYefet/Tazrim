import { NextResponse } from 'next/server'
import { adminRefusal, currentSession } from '@/lib/auth/http'
import { hasOwnPassword } from '@/lib/auth/household'
import { egressRefusal } from '@/lib/egress/access'
import { parseChange, relay, rpIdOf } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { signinKeysFor } from '@/lib/egress/signin-keys'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { change }: a change that loosens the filter (add or remove a domain, turn isolation off,
 * remove a key) asks for a passkey challenge. The updater validates the change and signs nothing
 * itself; the browser answers at /approve/finish. rpId is this request's host name.
 *
 * ENG-141: the signed-in admin's sign-in keys and whether they have a sign-in password go along, as
 * the updater needs them in two cases only. (1) No approver exists yet: the first approval pins the
 * key or password used (trust on first use; once an approver exists the updater ignores these).
 * (2) `add-approver`: the person's own key (kind passkey) or password (kind password) is what gets
 * added, after an existing approver signs.
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  const body = (await req.json().catch(() => null)) as { change?: unknown } | null
  const change = parseChange(body?.change)
  const rpId = rpIdOf(req.headers)
  if (!change || !rpId) return NextResponse.json({ code: 'INVALID', error: egressMessage('INVALID') }, { status: 400 })

  const session = await currentSession()
  const keys = session ? (await signinKeysFor(session.personId)).slice(0, 20) : []
  const password = session ? await hasOwnPassword(session.personId) : false
  if (change.action === 'add-approver' && change.kind === 'passkey' && keys.length === 0) return NextResponse.json({ code: 'NO_SIGNIN_PASSKEY', error: egressMessage('NO_SIGNIN_PASSKEY') }, { status: 409 })
  if (change.action === 'add-approver' && change.kind === 'password' && !password) return NextResponse.json({ code: 'NO_SIGNIN_PASSWORD', error: egressMessage('NO_SIGNIN_PASSWORD') }, { status: 409 })
  const send = change.action === 'add-approver' ? { action: 'add-approver' } : change
  const signin: Record<string, unknown> = {}
  if (session && !(change.action === 'add-approver' && change.kind === 'password') && keys.length > 0) {
    // "Dana · iPhone": the name the approver is pinned under
    signin.adopt = keys.map(k => ({ id: k.id, publicKey: k.publicKey, alg: k.alg, name: `${session.personName} · ${k.label}`.slice(0, 60) }))
  }
  if (session) {
    signin.adoptPassword = change.action === 'add-approver' ? change.kind === 'password' && password : password
    signin.userName = session.personName
  }
  const r = await relay('egress-approve-begin', { change: send, rpId, ...signin })
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
