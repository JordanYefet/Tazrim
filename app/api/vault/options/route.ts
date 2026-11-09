import { NextResponse } from 'next/server'
import { allow, fail, rpOr400, TOO_MANY } from '@/lib/auth/http'
import { vaultOptions, type VaultPurpose } from '@/lib/auth/webauthn'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { status } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

const PURPOSES: VaultPurpose[] = ['unlock', 'create', 'add']

/**
 * POST { purpose }: a passkey challenge for the vault, with the PRF salt to
 * ask each of the signed-in person's passkeys (`prf`, by credential id).
 */
export async function POST(req: Request) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  if (!allow(req, 'vault', 30)) return TOO_MANY()
  const rp = rpOr400(req)
  if (rp instanceof NextResponse) return rp
  const body = (await req.json().catch(() => null)) as { purpose?: unknown } | null
  const purpose = PURPOSES.find(p => p === body?.purpose)
  if (!purpose) return fail(400, 'בקשה לא תקינה', 'BAD_REQUEST')
  const vault = await status()
  if (purpose === 'create' && vault.exists) return fail(409, 'כבר יש כספת', 'VAULT_EXISTS')
  if (purpose !== 'create' && !vault.exists) return fail(409, 'עוד אין כספת', 'NO_VAULT')
  const options = await vaultOptions(rp, session.personId, purpose)
  if (!options) {
    return purpose === 'unlock'
      ? fail(409, 'לאף מפתח שלך אין עדיין גישה לכספת. פתחו אותה עם מפתח השחזור, או ממכשיר שכבר פותח אותה', 'NO_COPY')
      : purpose === 'create'
        ? fail(409, 'הכספת נפתחת רק עם מפתח (passkey), ולך עוד אין. הוסיפו מפתח במכשיר הזה (תפריט אישי ← הוספת מכשיר) ונסו שוב', 'NO_PASSKEY')
        : fail(409, 'כל המפתחות שלך כבר פותחים את הכספת', 'NO_PASSKEY')
  }
  return NextResponse.json(options)
}
