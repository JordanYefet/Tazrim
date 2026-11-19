import { NextResponse } from 'next/server'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { getUpdateView } from '@/lib/updates/state'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: the update card's whole state */
async function handleGET() {
  return readOnlyRefusal() ?? NextResponse.json(await getUpdateView())
}

export const GET = logged(handleGET)
