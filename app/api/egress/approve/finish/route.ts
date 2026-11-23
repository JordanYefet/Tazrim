import { NextResponse } from 'next/server'
import { egressRefusal } from '@/lib/egress/access'
import { relay } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { response } (a passkey answer) or { flowId, password }: the updater verifies it and applies
 * the change; 200 { ok, change, job? }. The password is never logged (this route is keys-only).
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { response?: unknown; flowId?: unknown; password?: unknown } | null
  const passkey = body?.response && typeof body.response === 'object' ? { response: body.response } : null
  const password = typeof body?.flowId === 'string' && typeof body.password === 'string' && body.password && body.password.length <= 500 ? { flowId: body.flowId.slice(0, 200), password: body.password } : null
  const answer = passkey ?? password
  if (!answer) return NextResponse.json({ code: 'INVALID', error: egressMessage('INVALID') }, { status: 400 })
  const r = await relay('egress-approve-finish', answer)
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
