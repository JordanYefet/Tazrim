import { NextResponse } from 'next/server'
import { isLocalRequest } from '@/lib/local-request'
import { cancelRun, getRun, submitCode, submitLinks } from '@/lib/sync/runs'
import type { LinkAction } from '@/lib/sync/store'

export const dynamic = 'force-dynamic'

/** GET: the run's state, polled by the sync sheet while it runs (ENG-91). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const run = getRun((await params).id)
  if (!run) return NextResponse.json({ error: 'הסנכרון לא נמצא', code: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ run })
}

function linkActions(value: unknown): LinkAction[] | null {
  if (!Array.isArray(value)) return null
  const out: LinkAction[] = []
  for (const v of value) {
    if (!v || typeof v !== 'object') return null
    const { externalAccount, action, accountId } = v as Record<string, unknown>
    if (typeof externalAccount !== 'string' || !externalAccount) return null
    if (action === 'link' && typeof accountId === 'string' && accountId) out.push({ externalAccount, action, accountId })
    else if (action === 'create' || action === 'ignore') out.push({ externalAccount, action })
    else return null
  }
  return out
}

/** POST { code } (the SMS code), { links } (answers for unknown accounts) or { cancel: true }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(req.headers)) {
    return NextResponse.json({ error: 'בשלב הזה אפשר לסנכרן רק מהמחשב שעליו האפליקציה רצה', code: 'NOT_LOCAL' }, { status: 403 })
  }
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { code?: unknown; links?: unknown; cancel?: unknown } | null

  if (body?.cancel === true) {
    return cancelRun(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'אין מה לבטל', code: 'NOT_WAITING' }, { status: 409 })
  }
  if (typeof body?.code === 'string') {
    const code = body.code.trim()
    if (!/^\d{4,8}$/.test(code)) return NextResponse.json({ error: 'קוד לא תקין', code: 'INVALID_CODE' }, { status: 400 })
    return submitCode(id, code)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'הסנכרון לא מחכה לקוד', code: 'NOT_WAITING' }, { status: 409 })
  }
  const actions = linkActions(body?.links)
  if (!actions) return NextResponse.json({ error: 'בקשה לא תקינה', code: 'INVALID' }, { status: 400 })
  const res = await submitLinks(id, actions)
  if (res.ok) return NextResponse.json({ ok: true })
  return NextResponse.json(
    { error: res.code === 'NOT_WAITING' ? 'הסנכרון לא מחכה לשיוך חשבונות' : 'שיוך החשבונות לא תקין', code: res.code },
    { status: res.code === 'NOT_WAITING' ? 409 : 400 }
  )
}
