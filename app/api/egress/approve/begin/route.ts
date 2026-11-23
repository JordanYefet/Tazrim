import { NextResponse } from 'next/server'
import { egressRefusal } from '@/lib/egress/access'
import { parseChange, relay, rpIdOf } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { change }: a change that loosens the filter (add or remove a domain, turn isolation off,
 * remove a key) asks for a passkey challenge. The updater validates the change and signs nothing
 * itself; the browser answers at /approve/finish. rpId is this request's host name.
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { change?: unknown } | null
  const change = parseChange(body?.change)
  const rpId = rpIdOf(req.headers)
  if (!change || !rpId) return NextResponse.json({ code: 'INVALID', error: egressMessage('INVALID') }, { status: 400 })
  const r = await relay('egress-approve-begin', { change, rpId })
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
