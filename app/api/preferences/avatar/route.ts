import { NextResponse } from 'next/server'
import { validateAvatar } from '@/lib/avatar/options'
import { storeAvatar } from '@/lib/preferences/avatar'
import { preferenceOwner } from '@/lib/preferences/owner'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** PUT { kind: 'art' | 'text', ... }: the signed-in person's own avatar (nobody else's) */
async function handlePUT(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const owner = await preferenceOwner()
  // No person to keep it for: no session, or the login is off
  if (!owner) return NextResponse.json({ error: 'צריך להתחבר', code: 'UNAUTHORIZED' }, { status: 401 })
  const avatar = validateAvatar(await req.json().catch(() => null))
  if (!avatar) return NextResponse.json({ error: 'תמונה לא מוכרת', code: 'INVALID' }, { status: 400 })
  await storeAvatar(owner, avatar)
  return NextResponse.json({ avatar })
}

export const PUT = logged(handlePUT)
