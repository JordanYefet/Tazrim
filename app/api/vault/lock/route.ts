import { NextResponse } from 'next/server'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { lock } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

/** POST: "lock now", for everyone in the household */
export async function POST() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  lock()
  return NextResponse.json({ ok: true })
}
