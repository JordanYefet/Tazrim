import { NextRequest, NextResponse } from 'next/server'
import { getAliases, normalizeProvider, upsertAlias, upsertAliasAndBulkUpdate } from '@/lib/db/aliases'

// Rules are keyed by provider ("leumi", "max", ...). The legacy `source`
// values (BANK / MAX / HITECH) are still accepted and mapped to a provider.
function providerFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? normalizeProvider(value) : undefined
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const aliases = await getAliases(providerFrom(sp.get('provider') ?? sp.get('source')))
  return NextResponse.json(aliases)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const provider = providerFrom(body.provider ?? body.source)
  if (!provider) return NextResponse.json({ error: 'חסר ספק' }, { status: 400 })
  const alias = await upsertAlias({
    provider,
    originalName: body.originalName,
    displayName: body.displayName,
    categoryOverride: body.categoryOverride,
  })
  return NextResponse.json(alias)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const provider = providerFrom(body.provider ?? body.source)
  if (!provider) return NextResponse.json({ error: 'חסר ספק' }, { status: 400 })
  const alias = await upsertAliasAndBulkUpdate({
    provider,
    originalName: body.originalName,
    displayName: body.displayName,
    categoryOverride: body.categoryOverride,
  })
  return NextResponse.json(alias)
}
