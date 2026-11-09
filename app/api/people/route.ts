import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/auth/http'
import { hasRecoveryCode, listPeople } from '@/lib/auth/household'

export const dynamic = 'force-dynamic'

/** GET: Settings → People: everyone and their devices, and which device this is */
export async function GET() {
  const [session, people, recovery] = await Promise.all([currentSession(), listPeople(), hasRecoveryCode()])
  return NextResponse.json({ people, me: session?.personId ?? null, thisDevice: session?.passkeyId ?? null, hasRecoveryCode: recovery })
}
