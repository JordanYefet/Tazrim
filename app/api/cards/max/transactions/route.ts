import { NextRequest, NextResponse } from 'next/server'
import { getCCTransactions } from '@/lib/db/cards'

export async function GET(req: NextRequest) {
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
    provider: 'MAX',
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
