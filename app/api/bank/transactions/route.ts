import { NextRequest, NextResponse } from 'next/server'
import { getBankTransactions } from '@/lib/db/bank'
import { parseBankFlow } from '@/lib/insights/bank-categories'

/** `accountId` = one bank account (the /banks/[accountId] page); omitted = every bank account. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const accountId = sp.get('accountId') ?? undefined
  const year = sp.get('year') ? Number(sp.get('year')) : undefined
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const search = sp.get('search') ?? undefined
  const merchant = sp.get('merchant') ?? undefined
  const category = sp.get('category') ?? undefined
  const direction = parseBankFlow(sp.get('flow'))
  const showIgnored = sp.get('showIgnored') === 'true'
  const skip = sp.get('skip') ? Number(sp.get('skip')) : undefined
  const take = !month ? 50 : undefined

  const transactions = await getBankTransactions({ accountId, year, month, search, merchant, category, direction, showIgnored, take, skip })
  return NextResponse.json(transactions)
}
