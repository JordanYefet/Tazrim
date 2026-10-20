import { NextRequest, NextResponse } from 'next/server'
import { getYearSummary } from '@/lib/db/summary'
import { getPeriod } from '@/lib/period-server'

export async function GET(req: NextRequest) {
  // ?year=, else the remembered period, else the current year (same as the pages)
  const { year } = await getPeriod(req.nextUrl.searchParams)

  return NextResponse.json(await getYearSummary(year))
}
