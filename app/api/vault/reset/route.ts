import { NextResponse } from 'next/server'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { resetVault } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: every key lost → delete the vault and its sign-ins, to set it up again */
async function handlePOST() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  await resetVault()
  return NextResponse.json({ ok: true })
}

export const POST = logged(handlePOST)
