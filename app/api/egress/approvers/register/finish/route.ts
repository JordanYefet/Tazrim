import { NextResponse } from 'next/server'
import { egressRefusal } from '@/lib/egress/access'
import { relay } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { code, name, response } (a new passkey) or { code, name, password } (an approval password,
 * 12 characters or more): the code is the one typed from the file. 200 { ok, approver }. Keys-only in the log.
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { code?: unknown; name?: unknown; response?: unknown; password?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim().slice(0, 12) : ''
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const proof =
    body?.response && typeof body.response === 'object' ? { response: body.response } : typeof body?.password === 'string' && body.password && body.password.length <= 500 ? { password: body.password } : null
  if (!code || !name || !proof) return NextResponse.json({ code: 'INVALID', error: egressMessage('INVALID') }, { status: 400 })
  const r = await relay('egress-register-finish', { code, name, ...proof })
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
