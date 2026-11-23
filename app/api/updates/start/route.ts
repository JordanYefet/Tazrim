import { NextResponse } from 'next/server'
import { getUpdateCache } from '@/lib/updates/check'
import { parseConfirm } from '@/lib/updates/compose'
import { MESSAGES, messageFor } from '@/lib/updates/messages'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { helperStart } from '@/lib/updates/helper'
import { parseVersion } from '@/lib/updates/version'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { version: "x.y.z", compose? }, the version the daily check found: the helper updates to it.
 * `compose` is what the person confirmed about the install folder's compose files (their hashes, and
 * the approval when there are approvers; see lib/updates/compose.ts). 202, or a fixed code:
 * INVALID_VERSION and NOT_LATEST 400 (not asked), NO_HELPER 503, BUSY 409, NOT_NEWER 400,
 * NOT_UPDATABLE 422, COMPOSE_NEEDS_CONFIRM and COMPOSE_CHANGED 409, COMPOSE_FETCH_FAILED 502, and
 * the approval's own refusals (BAD_PASSWORD, LOCKED, ...)
 */
async function handlePOST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { version?: unknown; compose?: unknown } | null
  const v = typeof body?.version === 'string' ? parseVersion(body.version) : null
  if (!v) return NextResponse.json({ error: 'גרסה לא תקינה', code: 'INVALID_VERSION' }, { status: 400 })
  // Only the release the daily check found (and showed with its notes), never a version picked by hand
  const version = v.join('.')
  if ((await getUpdateCache()).latest?.version !== version) {
    return NextResponse.json({ error: MESSAGES.NOT_LATEST, code: 'NOT_LATEST' }, { status: 400 })
  }
  const compose = body?.compose === undefined ? undefined : parseConfirm(body.compose)
  if (compose === null) return NextResponse.json({ error: MESSAGES.COMPOSE_NEEDS_CONFIRM, code: 'COMPOSE_NEEDS_CONFIRM' }, { status: 409 })
  const r = await helperStart(version, compose)
  if (r.status === 202) return NextResponse.json({ ok: true }, { status: 202 })
  const code = r.code ?? 'HELPER_ERROR'
  return NextResponse.json({ error: messageFor(code), code, ...(r.until ? { until: r.until } : {}) }, { status: r.status })
}

export const POST = logged(handlePOST)
