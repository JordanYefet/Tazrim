import { NextRequest, NextResponse } from 'next/server'
import { getCCTransactions } from '@/lib/db/cards'
import { getAccount } from '@/lib/db/accounts'

/** One card's transactions; same paging as the /cards/[accountId] page (50 at a time unless a month is selected). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params
  const account = await getAccount(accountId)
  if (!account || account.kind !== 'CREDIT_CARD') {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }

  const sp = req.nextUrl.searchParams
  const year = sp.get('year') ? Number(sp.get('year')) : undefined
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const search = sp.get('search') ?? undefined
  const merchant = sp.get('merchant') ?? undefined
  const category = sp.get('category') ?? undefined
  const showIgnored = sp.get('showIgnored') === 'true'
  const skip = sp.get('skip') ? Number(sp.get('skip')) : undefined
  const take = !month ? 50 : undefined

  const transactions = await getCCTransactions({
    accountId,
    year,
    month,
    search,
    merchant,
    category,
    showIgnored,
    take,
    skip,
  })
  return NextResponse.json(transactions)
}
