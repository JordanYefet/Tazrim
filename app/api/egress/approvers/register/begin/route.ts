import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/auth/http'
import { hasOwnPassword } from '@/lib/auth/household'
import { egressRefusal } from '@/lib/egress/access'
import { relay, rpIdOf } from '@/lib/egress/helper'
import { egressMessage } from '@/lib/egress/messages'
import { signinKeysFor } from '@/lib/egress/signin-keys'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

const SOURCES = ['signin-passkey', 'new-passkey', 'password', 'signin-password'] as const
type Source = (typeof SOURCES)[number]

const refuse = (status: number, code: string) => NextResponse.json({ code, error: egressMessage(code) }, { status })

/**
 * POST { name?, source }: the updater writes a one-time code to a file in the Tazrim folder (which the app cannot read).
 * - new-passkey (the default, as older pages sent it): `name` is the new key's; returns creation options
 * - signin-passkey: the signed-in person's own sign-in passkeys are offered to the updater to adopt; returns
 *   assertion options (mode 'adopt'), or NO_SIGNIN_PASSKEY when they have none
 * - password / signin-password: only the code is opened here; the password comes with finish
 */
async function handlePOST(req: Request) {
  const refused = egressRefusal(req.headers)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { name?: unknown; source?: unknown } | null
  const source: Source | null = body?.source === undefined ? 'new-passkey' : SOURCES.find(s => s === body.source) ?? null
  const rpId = rpIdOf(req.headers)
  if (!source || !rpId) return refuse(400, 'INVALID')
  const typed = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : ''

  if (source === 'new-passkey' || source === 'password') {
    const name = typed || (source === 'password' ? 'סיסמת אישור' : '')
    if (!name) return refuse(400, 'INVALID')
    const r = await relay('egress-register-begin', { rpId, rpName: 'תזרים', userName: name })
    return NextResponse.json(r.body, { status: r.status })
  }

  const session = await currentSession()
  if (!session) return refuse(401, 'SIGNED_OUT')
  if (source === 'signin-password') {
    if (!(await hasOwnPassword(session.personId))) return refuse(409, 'NO_SIGNIN_PASSWORD')
    const r = await relay('egress-register-begin', { rpId, rpName: 'תזרים', userName: session.personName })
    return NextResponse.json(r.body, { status: r.status })
  }
  const keys = (await signinKeysFor(session.personId)).slice(0, 20)
  if (keys.length === 0) return refuse(409, 'NO_SIGNIN_PASSKEY')
  const r = await relay('egress-register-begin', { rpId, rpName: 'תזרים', userName: session.personName, adopt: keys.map(k => ({ id: k.id, publicKey: k.publicKey, alg: k.alg })) })
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = logged(handlePOST)
