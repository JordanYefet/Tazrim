import { NextResponse } from 'next/server'
import { peopleInfo } from '@/lib/auth/people-info'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: Settings → People (see peopleInfo) */
async function handleGET() {
  return NextResponse.json(await peopleInfo())
}

export const GET = logged(handleGET)
