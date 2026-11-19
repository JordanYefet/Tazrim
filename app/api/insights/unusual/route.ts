import { NextRequest, NextResponse } from 'next/server'
import { getUnusualTransactions } from '@/lib/db/unusual'
import { logged } from '@/lib/log/route'

/** GET ?since=YYYY-MM-DD&until=YYYY-MM-DD&accountId=a&accountId=b — flagged, non-dismissed transactions */
async function handleGET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const accountIds = sp.getAll('accountId')
  const items = await getUnusualTransactions({
    since: sp.get('since') ?? undefined,
    until: sp.get('until') ?? undefined,
    accountId: accountIds.length ? accountIds : undefined,
  })
  return NextResponse.json(items)
}

export const GET = logged(handleGET)
