import { NextResponse } from 'next/server'
import { getNetworkInfo } from '@/lib/install/network'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: what the phones and HTTPS pages need beside the install view (ENG-122/123). Signed-in only. */
async function handleGET() {
  return readOnlyRefusal() ?? NextResponse.json(await getNetworkInfo())
}

export const GET = logged(handleGET)
