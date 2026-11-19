import { NextRequest, NextResponse } from 'next/server'
import { getRecurringSeries } from '@/lib/db/recurring'
import { logged } from '@/lib/log/route'

/** GET /api/recurring?accountId=…&today=YYYY-MM-DD — detected series with overrides applied */
async function handleGET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const accountIds = sp.getAll('accountId').filter(Boolean)
  const today = sp.get('today') ?? undefined
  const overview = await getRecurringSeries({
    accountId: accountIds.length === 0 ? undefined : accountIds.length === 1 ? accountIds[0] : accountIds,
    ...(today ? { today } : {}),
  })
  return NextResponse.json({ ...overview, transactionIds: [...overview.transactionIds] })
}

export const GET = logged(handleGET)
