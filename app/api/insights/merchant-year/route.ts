import { NextRequest, NextResponse } from 'next/server'
import { getMerchantYear } from '@/lib/db/category-year'

/**
 * GET ?source=bank|card&id=<row id>&year=YYYY — that row's merchant over the year
 * (lib/db/category-year.ts): { name, year, months: { 1..12 }, total, count }. The
 * transaction window's "העסק הזה לאורך השנה".
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const source = sp.get('source')
  const id = sp.get('id')
  const year = Number(sp.get('year'))
  if ((source !== 'bank' && source !== 'card') || !id || !Number.isInteger(year) || year < 1900 || year > 2999) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }
  const result = await getMerchantYear({ source, id, year })
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result)
}
