import { NextResponse } from 'next/server'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { getUpdateView } from '@/lib/updates/state'

export const dynamic = 'force-dynamic'

/** GET: the update card's whole state */
export async function GET() {
  return readOnlyRefusal() ?? NextResponse.json(await getUpdateView())
}
