import { NextResponse } from 'next/server'
import { adminRefusal } from '@/lib/auth/http'
import { isResponse, sessionOr401, whileOpen } from '@/lib/vault/http'
import { replaceRecoveryKey } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: a new recovery key while the vault is open (shown once); the old one stops working */
async function handlePOST() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  return whileOpen(async () => NextResponse.json({ recoveryKey: await replaceRecoveryKey() }))
}

export const POST = logged(handlePOST)
