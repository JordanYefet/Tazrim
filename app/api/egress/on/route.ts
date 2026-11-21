import { NextResponse } from 'next/server'
import { egressRefusal } from '@/lib/egress/access'
import { relay } from '@/lib/egress/helper'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: turn isolation ON. It only tightens, so the normal helper token is enough (no passkey). 202 { job }, or { code, error } */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const r = await relay('/v1/egress/on', {})
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
