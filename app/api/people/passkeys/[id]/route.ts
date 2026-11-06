import { NextResponse } from 'next/server'
import { fail } from '@/lib/auth/http'
import { revokePasskey } from '@/lib/auth/household'

export const dynamic = 'force-dynamic'

/** DELETE: revokes a device; its sessions end with it, so its next request fails */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await revokePasskey(id)
  if (result === 'not-found') return fail(404, 'המכשיר לא נמצא', 'NOT_FOUND')
  if (result === 'last-passkey') return fail(409, 'זה המפתח האחרון. הוסיפו מכשיר אחר לפני שמבטלים אותו', 'LAST_PASSKEY')
  return NextResponse.json({ ok: true })
}
