import { NextRequest, NextResponse } from 'next/server'
import { getCCTransactions } from '@/lib/db/cards'
import { accountIdsParam } from '@/lib/accounts/routes'

/**
 * Several cards' transactions together (`?accountId=` repeated: the /cards table);
 * omitted = every card. Same paging as /api/cards/[accountId]/transactions.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const transactions = await getCCTransactions({
    accountId: accountIdsParam(sp),
    year: sp.get('year') ? Number(sp.get('year')) : undefined,
    month,
    search: sp.get('search') ?? undefined,
    merchant: sp.get('merchant') ?? undefined,
    category: sp.get('category') ?? undefined,
    showIgnored: sp.get('showIgnored') === 'true',
    take: !month ? 50 : undefined,
    skip: sp.get('skip') ? Number(sp.get('skip')) : undefined,
  })
  return NextResponse.json(transactions)
}
