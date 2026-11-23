import { NextResponse } from 'next/server'
import { getUpdateCache } from '@/lib/updates/check'
import { MESSAGES, messageFor } from '@/lib/updates/messages'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { helperPlan } from '@/lib/updates/helper'
import { parseVersion } from '@/lib/updates/version'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { version: "x.y.z" }: what the update would do to the compose files in the install folder
 * (ENG-137), for the person to see before it starts. 200 with the plan (files with their diffs), or
 * a fixed code: INVALID_VERSION and NOT_LATEST 400, NO_HELPER 503, COMPOSE_FETCH_FAILED 502.
 * Nothing is changed by asking.
 */
async function handlePOST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as {
    version?: unknown
  } | null
  const v = typeof body?.version === 'string' ? parseVersion(body.version) : null
  if (!v) return NextResponse.json({ error: 'גרסה לא תקינה', code: 'INVALID_VERSION' }, { status: 400 })
  const version = v.join('.')
  if ((await getUpdateCache()).latest?.version !== version) {
    return NextResponse.json({ error: MESSAGES.NOT_LATEST, code: 'NOT_LATEST' }, { status: 400 })
  }
  const r = await helperPlan(version)
  if ('plan' in r) return NextResponse.json(r.plan)
  return NextResponse.json({ error: messageFor(r.code), code: r.code }, { status: r.status })
}

export const POST = logged(handlePOST)
