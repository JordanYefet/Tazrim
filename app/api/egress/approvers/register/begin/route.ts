import { NextResponse } from 'next/server'
import { egressRefusal } from '@/lib/egress/access'
import { relay, rpIdOf } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST { name }: the updater writes a one-time code to a file in the Tazrim folder (which the app cannot read) and returns the passkey creation options */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const rpId = rpIdOf(req.headers)
  if (!name || !rpId) return NextResponse.json({ code: 'INVALID', error: egressMessage('INVALID') }, { status: 400 })
  const r = await relay('egress-register-begin', { rpId, rpName: 'תזרים', userName: name })
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
