import { NextResponse } from 'next/server'
import { MESSAGES } from '@/lib/updates/messages'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { helperRollback } from '@/lib/updates/helper'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: the helper puts the previous version and the pre-update backup back. 202, or 409 / 503 */
async function handlePOST() {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const r = await helperRollback()
  if (r.status === 202) return NextResponse.json({ ok: true }, { status: 202 })
  const code = r.code ?? 'HELPER_ERROR'
  return NextResponse.json({ error: MESSAGES[code], code }, { status: r.status })
}

export const POST = logged(handlePOST)
