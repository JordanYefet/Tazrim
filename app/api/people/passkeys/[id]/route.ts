import { NextResponse } from 'next/server'
import { adminOr403, currentSession, fail } from '@/lib/auth/http'
import { prisma } from '@/lib/db/client'
import { revokePasskey } from '@/lib/auth/household'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** DELETE: revokes a device; its sessions end with it, so its next request fails. Your own devices are yours; someone else's is for admins (ENG-140). */
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await currentSession()
  const owner = await prisma.passkey.findUnique({ where: { id }, select: { personId: true } })
  if (owner && owner.personId !== session?.personId) {
    const notAdmin = adminOr403(session)
    if (notAdmin) return notAdmin
  }
  const result = await revokePasskey(id)
  if (result === 'not-found') return fail(404, 'המכשיר לא נמצא', 'NOT_FOUND')
  if (result === 'last-passkey') return fail(409, 'זה המפתח האחרון. הוסיפו מכשיר אחר לפני שמבטלים אותו', 'LAST_PASSKEY')
  return NextResponse.json({ ok: true })
}

export const DELETE = logged(handleDELETE)
