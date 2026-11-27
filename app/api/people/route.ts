import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/auth/http'
import { hasRecoveryCode, listPeople } from '@/lib/auth/household'
import { getAvatars } from '@/lib/preferences/avatar'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: Settings → People: everyone with their level and devices, which device this is, and your own level (ENG-140) */
async function handleGET() {
  const [session, people, recovery] = await Promise.all([currentSession(), listPeople(), hasRecoveryCode()])
  const avatars = await getAvatars(people.map(p => p.id))
  return NextResponse.json({ people: people.map(p => ({ ...p, avatar: avatars.get(p.id) ?? null })), me: session?.personId ?? null, myRole: session?.role ?? null, thisDevice: session?.passkeyId ?? null, hasRecoveryCode: recovery })
}

export const GET = logged(handleGET)
