import { NextResponse } from 'next/server'
import { isResponse, sessionOr401, whileOpen } from '@/lib/vault/http'
import { replaceRecoveryKey } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

/** POST: a new recovery key while the vault is open (shown once); the old one stops working */
export async function POST() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  return whileOpen(async () => NextResponse.json({ recoveryKey: await replaceRecoveryKey() }))
}
