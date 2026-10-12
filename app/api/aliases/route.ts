import { NextRequest, NextResponse } from 'next/server'
import { getAliases, upsertAlias, upsertAliasAndBulkUpdate } from '@/lib/db/aliases'
import type { AliasSource } from '@prisma/client'

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source') as AliasSource | null
  const aliases = await getAliases(source ?? undefined)
  return NextResponse.json(aliases)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const alias = await upsertAlias(body)
  return NextResponse.json(alias)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const alias = await upsertAliasAndBulkUpdate({
    source: body.source,
    originalName: body.originalName,
    displayName: body.displayName,
    categoryOverride: body.categoryOverride,
  })
  return NextResponse.json(alias)
}
