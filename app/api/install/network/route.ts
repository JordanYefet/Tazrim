import { NextResponse } from 'next/server'
import { getNetworkInfo } from '@/lib/install/network'
import { readOnlyRefusal } from '@/lib/updates/guard'

export const dynamic = 'force-dynamic'

/** GET: what the phones and HTTPS pages need beside the install view (ENG-122/123). Signed-in only. */
export async function GET() {
  return readOnlyRefusal() ?? NextResponse.json(await getNetworkInfo())
}
