import { NextRequest, NextResponse } from 'next/server'
import { searchTransactions } from '@/lib/db/search'
import { parseSearchParams } from '@/lib/search/query'

/**
 * GET /api/search — every account, every year.
 * ?q=text &amount=120|100-200|>100|<50 (or min= / max=) &from=YYYY-MM-DD &to=YYYY-MM-DD
 * &account=id (repeatable) &category=name (repeatable) &ignored=1 &cursor= &limit= (default 30, max 100)
 * -> { results: SearchResult[], nextCursor: string | null, total: number }
 */
export async function GET(req: NextRequest) {
  const filters = parseSearchParams(req.nextUrl.searchParams)
  if (filters.amountInvalid) {
    return NextResponse.json({ error: 'invalid amount' }, { status: 400 })
  }
  return NextResponse.json(await searchTransactions(filters))
}
