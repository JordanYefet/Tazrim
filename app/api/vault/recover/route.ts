import { NextResponse } from 'next/server'
import { allow, fail, TOO_MANY } from '@/lib/auth/http'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { unlockWithRecovery } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

/** POST { recoveryKey }: opens the vault without a passkey (lost devices, no PRF) */
export async function POST(req: Request) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  if (!allow(req, 'vault-recover', 10, 15 * 60 * 1000)) return TOO_MANY()
  const body = (await req.json().catch(() => null)) as { recoveryKey?: unknown } | null
  if (!(await unlockWithRecovery(body?.recoveryKey, `${session.personName}, מפתח שחזור`))) {
    return fail(403, 'מפתח השחזור שגוי', 'WRONG_KEY')
  }
  return NextResponse.json({ ok: true })
}
