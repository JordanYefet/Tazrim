import { NextRequest, NextResponse } from 'next/server'
import { getYearSummary } from '@/lib/db/summary'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const year = Number(sp.get('year') ?? new Date().getFullYear())

  return NextResponse.json(await getYearSummary(year))
}
