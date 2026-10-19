import { NextResponse } from 'next/server'
import { isLocalRequest } from '@/lib/local-request'
import { matchesDeleteAllPhrase } from '@/lib/data/delete-all-phrase'
import { wipeAllData } from '@/lib/db/wipe'

export const dynamic = 'force-dynamic'

/**
 * Deletes all data (ENG-62). Body: { confirm: "מחק הכל" }.
 * 403 for a request that did not come from this machine (lib/local-request.ts),
 * 400 for a wrong or missing phrase. 200 { ok, deleted: { <table>: rows } }.
 */
export async function POST(req: Request) {
  if (!isLocalRequest(req.headers)) {
    return NextResponse.json(
      { error: 'אפשר למחוק את כל הנתונים רק מהמחשב שעליו האפליקציה רצה', code: 'NOT_LOCAL' },
      { status: 403 }
    )
  }
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  if (!matchesDeleteAllPhrase(body?.confirm)) {
    return NextResponse.json({ error: 'יש להקליד את ביטוי האישור כדי למחוק', code: 'CONFIRMATION_REQUIRED' }, { status: 400 })
  }
  const deleted = await wipeAllData()
  return NextResponse.json({ ok: true, deleted })
}
