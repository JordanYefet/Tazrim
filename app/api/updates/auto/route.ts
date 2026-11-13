import { NextResponse } from 'next/server'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { setAutoCheck } from '@/lib/updates/settings'

export const dynamic = 'force-dynamic'

/** PUT { on: boolean }: the daily check on or off */
export async function PUT(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null
  if (typeof body?.on !== 'boolean') return NextResponse.json({ error: 'on חייב להיות true או false', code: 'INVALID' }, { status: 400 })
  await setAutoCheck(body.on)
  return NextResponse.json({ on: body.on })
}
