import { NextResponse } from 'next/server'
import { getUpdateCache } from '@/lib/updates/check'
import { MESSAGES } from '@/lib/updates/messages'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { helperStart } from '@/lib/updates/helper'
import { parseVersion } from '@/lib/updates/version'

export const dynamic = 'force-dynamic'

/** POST { version: "x.y.z" }, the version the daily check found: the helper updates to it. 202, or a fixed code: INVALID_VERSION and NOT_LATEST 400 (not asked), NO_HELPER 503, BUSY 409, NOT_NEWER 400, NOT_UPDATABLE 422 */
export async function POST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { version?: unknown } | null
  const v = typeof body?.version === 'string' ? parseVersion(body.version) : null
  if (!v) return NextResponse.json({ error: 'גרסה לא תקינה', code: 'INVALID_VERSION' }, { status: 400 })
  // Only the release the daily check found (and showed with its notes), never a version picked by hand
  const version = v.join('.')
  if ((await getUpdateCache()).latest?.version !== version) {
    return NextResponse.json({ error: MESSAGES.NOT_LATEST, code: 'NOT_LATEST' }, { status: 400 })
  }
  const r = await helperStart(version)
  if (r.status === 202) return NextResponse.json({ ok: true }, { status: 202 })
  const code = r.code ?? 'HELPER_ERROR'
  return NextResponse.json({ error: MESSAGES[code], code }, { status: r.status })
}
