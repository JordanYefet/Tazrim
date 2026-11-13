import { NextResponse } from 'next/server'
import { MESSAGES } from '@/lib/updates/messages'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { helperStart } from '@/lib/updates/helper'
import { parseVersion } from '@/lib/updates/version'

export const dynamic = 'force-dynamic'

/** POST { version: "x.y.z" }: the helper updates to it. 202, or a fixed code: NO_HELPER 503, BUSY and NO_ROLLBACK 409, NOT_NEWER 400, NOT_UPDATABLE 422 */
export async function POST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { version?: unknown } | null
  const v = typeof body?.version === 'string' ? parseVersion(body.version) : null
  if (!v) return NextResponse.json({ error: 'גרסה לא תקינה', code: 'INVALID_VERSION' }, { status: 400 })
  const r = await helperStart(v.join('.'))
  if (r.status === 202) return NextResponse.json({ ok: true }, { status: 202 })
  const code = r.code ?? 'HELPER_ERROR'
  return NextResponse.json({ error: MESSAGES[code], code }, { status: r.status })
}
