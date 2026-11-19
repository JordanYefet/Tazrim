import { NextRequest, NextResponse } from 'next/server'
import { getYearSummary } from '@/lib/db/summary'
import { getPeriod } from '@/lib/period-server'
import { logged } from '@/lib/log/route'

async function handleGET(req: NextRequest) {
  // ?year=, else the remembered period, else the current year (same as the pages)
  const { year } = await getPeriod(req.nextUrl.searchParams)

  return NextResponse.json(await getYearSummary(year))
}

export const GET = logged(handleGET)
