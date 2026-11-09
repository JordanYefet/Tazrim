import { NextResponse } from 'next/server'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { resetVault } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

/** POST: every key lost → delete the vault and its sign-ins, to set it up again */
export async function POST() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  await resetVault()
  return NextResponse.json({ ok: true })
}
