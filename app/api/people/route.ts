import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/auth/http'
import { hasRecoveryCode, listPeople } from '@/lib/auth/household'
import { getAvatars } from '@/lib/preferences/avatar'

export const dynamic = 'force-dynamic'

/** GET: Settings → People: everyone and their devices, and which device this is */
export async function GET() {
  const [session, people, recovery] = await Promise.all([currentSession(), listPeople(), hasRecoveryCode()])
  const avatars = await getAvatars(people.map(p => p.id))
  return NextResponse.json({ people: people.map(p => ({ ...p, avatar: avatars.get(p.id) ?? null })), me: session?.personId ?? null, thisDevice: session?.passkeyId ?? null, hasRecoveryCode: recovery })
}
