import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/auth/http'
import { hasOwnPassword } from '@/lib/auth/household'
import { egressRefusal } from '@/lib/egress/access'
import { signinKeysFor } from '@/lib/egress/signin-keys'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: what the signed-in person can adopt as approval keys: how many sign-in passkeys, and whether they have a sign-in password. Counts, and the credential ids (so the page can tell which are already approvers). */
async function handleGET(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const session = await currentSession()
  if (!session) return NextResponse.json({ passkeys: 0, password: false, ids: [] })
  const [keys, password] = await Promise.all([signinKeysFor(session.personId), hasOwnPassword(session.personId)])
  return NextResponse.json({ passkeys: keys.length, password, ids: keys.map(k => k.id) })
}

export const GET = logged(handleGET)
