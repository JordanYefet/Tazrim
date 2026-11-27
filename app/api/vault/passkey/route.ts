import { NextResponse } from 'next/server'
import { allow, fail, TOO_MANY } from '@/lib/auth/http'
import { takeChallenge, verifyAuthentication } from '@/lib/auth/webauthn'
import { isResponse, sessionOr401, whileOpen } from '@/lib/vault/http'
import { addPasskey, createVault, unlockWithPasskeyOrRegister } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

const VAULT_PENDING_MESSAGE = 'המפתח שלך נרשם. בפעם הבאה שמישהו יפתח את הכספת הוא יתווסף, ואז הוא יפתח אותה.'

/**
 * POST { flowId, response, prf }: the passkey's answer to a vault challenge,
 * with its PRF output (base64url, 32 bytes). The signature proves the passkey
 * was there; the PRF output, which the browser doesn't sign, must still open
 * this passkey's copy of the vault key. It is used and dropped, never stored.
 *   create: a new vault, open, and its recovery key (shown once)
 *   unlock: opens the vault. A passkey with no copy yet leaves its mailbox (or, when the vault is open, gets
 *           its copy at once); then 409 VAULT_PENDING says the next opening will give it one (ENG-140)
 *   add:    gives this passkey its own copy (the vault must be open)
 */
async function handlePOST(req: Request) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  if (!allow(req, 'vault', 30)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { flowId?: unknown; response?: unknown; prf?: unknown } | null
  const pending = takeChallenge(body?.flowId)
  if (!pending || pending.flow.kind !== 'vault' || pending.flow.personId !== session.personId) {
    return fail(400, 'פג תוקף הבקשה. נסו שוב', 'EXPIRED')
  }
  const flow = pending.flow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passkey = await verifyAuthentication(pending, body?.response as any)
  if (!passkey || passkey.personId !== session.personId) return fail(403, 'המפתח לא אושר', 'NOT_VERIFIED')
  const salt = flow.salts[passkey.credentialId]
  const prf = typeof body?.prf === 'string' ? Buffer.from(body.prf, 'base64url') : null
  if (!salt || !prf || prf.length !== 32) {
    return fail(422, 'המפתח במכשיר הזה לא תומך בפתיחת הכספת (צריך iOS 18, macOS 15 או Chrome עדכני). אפשר לפתוח עם מפתח השחזור', 'NO_PRF')
  }
  const by = `${session.personName}, ${passkey.label}`
  try {
    if (flow.purpose === 'create') {
      const recoveryKey = await createVault(passkey.id, prf, salt, by)
      if (recoveryKey === 'exists') return fail(409, 'כבר יש כספת', 'VAULT_EXISTS')
      return NextResponse.json({ ok: true, recoveryKey })
    }
    if (flow.purpose === 'unlock') {
      const result = await unlockWithPasskeyOrRegister(passkey.id, prf, salt, by)
      if (result === 'wrong-key') return fail(403, 'המפתח לא פתח את הכספת', 'WRONG_KEY')
      if (result === 'pending') return fail(409, VAULT_PENDING_MESSAGE, 'VAULT_PENDING')
      return NextResponse.json({ ok: true, result })
    }
    return await whileOpen(async () => {
      await addPasskey(passkey.id, prf, salt)
      return NextResponse.json({ ok: true })
    })
  } finally {
    prf.fill(0)
  }
}

export const POST = logged(handlePOST)
