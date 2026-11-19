import { NextResponse } from 'next/server'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { lock } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: "lock now", for everyone in the household */
async function handlePOST() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  lock()
  return NextResponse.json({ ok: true })
}

export const POST = logged(handlePOST)
