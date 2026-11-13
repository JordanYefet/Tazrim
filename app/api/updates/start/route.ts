import { NextResponse } from 'next/server'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { helperStart } from '@/lib/updates/helper'
import { parseVersion } from '@/lib/updates/version'

export const dynamic = 'force-dynamic'

/** POST { version: "x.y.z" }: the helper updates to it. 202, or the helper's status (503 NO_HELPER when it is absent) */
export async function POST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { version?: unknown } | null
  const v = typeof body?.version === 'string' ? parseVersion(body.version) : null
  if (!v) return NextResponse.json({ error: 'גרסה לא תקינה', code: 'INVALID_VERSION' }, { status: 400 })
  const r = await helperStart(v.join('.'))
  if (r.status === 202) return NextResponse.json({ ok: true }, { status: 202 })
  return NextResponse.json({ error: r.error ?? 'HELPER_ERROR', code: r.status === 503 ? 'NO_HELPER' : 'REFUSED' }, { status: r.status })
}
