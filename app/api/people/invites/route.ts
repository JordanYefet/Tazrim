import { NextResponse } from 'next/server'
import { adminOr403, currentSession, fail } from '@/lib/auth/http'
import { createInvite } from '@/lib/auth/household'
import { relyingParty } from '@/lib/auth/webauthn'
import { prisma } from '@/lib/db/client'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * POST { personId? }: a one-time invite link, about 15 minutes: a new person, or another device for personId.
 * Inviting a new person, or a device for someone else, is for admins; another device for yourself is yours (ENG-140).
 */
async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as { personId?: unknown } | null
  const personId = typeof body?.personId === 'string' ? body.personId : null
  const session = await currentSession()
  if (!session || personId !== session.personId) {
    const notAdmin = adminOr403(session)
    if (notAdmin) return notAdmin
  }
  if (personId && !(await prisma.person.findUnique({ where: { id: personId }, select: { id: true } }))) {
    return fail(404, 'האדם לא נמצא', 'NOT_FOUND')
  }
  const rp = relyingParty(req.headers)
  if (!rp) return fail(400, 'הכתובת הזאת לא מורשית לכניסה', 'BAD_ORIGIN')
  const { token, expiresAt } = await createInvite(personId)
  return NextResponse.json({ url: `${rp.origin}/invite/${token}`, expiresAt })
}

export const POST = logged(handlePOST)
