import { NextResponse } from 'next/server'
import { isAuthRequired } from '@/lib/auth/config'
import { clearedSessionCookie } from '@/lib/auth/session'
import { relyingParty } from '@/lib/auth/webauthn'
import { fail } from '@/lib/auth/http'
import { confirmSignedInPerson } from '@/lib/auth/confirm'
import { isLocalRequest } from '@/lib/local-request'
import { matchesDeleteAllPhrase } from '@/lib/data/delete-all-phrase'
import { wipeAllData } from '@/lib/db/wipe'
import { lock } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

interface Body {
  confirm?: unknown
  flowId?: unknown
  response?: unknown
  password?: unknown
}

/**
 * Deletes all data (ENG-62). Body: { confirm: "מחק הכל" } plus, with the login
 * on (ENG-89), proof that the signed-in person is at this device right now:
 * { flowId, response } from their passkey (POST ./options) or { password }.
 * With the login off (development), only from this machine, as before.
 *
 * The login goes with the data: everyone is signed out and the app opens at
 * /setup, with a new setup code in the server log.
 *
 * 400 for a wrong or missing phrase, 401/403 when not confirmed.
 * 200 { ok, deleted: { <table>: rows } }.
 */
async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null
  if (isAuthRequired()) {
    const denied = await confirmSignedInPerson(req, body, 'delete-all')
    if (denied) return denied
  } else if (!isLocalRequest(req.headers)) {
    return fail(403, 'אפשר למחוק את כל הנתונים רק מהמחשב שעליו האפליקציה רצה', 'NOT_LOCAL')
  }
  if (!matchesDeleteAllPhrase(body?.confirm)) {
    return fail(400, 'יש להקליד את ביטוי האישור כדי למחוק', 'CONFIRMATION_REQUIRED')
  }
  const deleted = await wipeAllData()
  // The vault's copies went with the data; its key leaves memory too
  lock()
  const res = NextResponse.json({ ok: true, deleted })
  res.cookies.set(clearedSessionCookie(relyingParty(req.headers)?.secure ?? false))
  return res
}

export const POST = logged(handlePOST)
