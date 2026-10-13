import { NextRequest, NextResponse } from 'next/server'
import { getUnusualTransactions } from '@/lib/db/unusual'

/** GET ?since=YYYY-MM-DD&until=YYYY-MM-DD&accountId=a&accountId=b — flagged, non-dismissed transactions */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const accountIds = sp.getAll('accountId')
  const items = await getUnusualTransactions({
    since: sp.get('since') ?? undefined,
    until: sp.get('until') ?? undefined,
    accountId: accountIds.length ? accountIds : undefined,
  })
  return NextResponse.json(items)
}
