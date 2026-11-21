import { NextResponse } from 'next/server'
import { egressRefusal } from '@/lib/egress/access'
import { getEgressView } from '@/lib/egress/helper'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: network isolation's whole state (ENG-133): the switch, the extra domains, keys, refusals, changes */
async function handleGET(req: Request) {
  return egressRefusal(req.headers) ?? NextResponse.json(await getEgressView())
}

export const GET = logged(handleGET)
