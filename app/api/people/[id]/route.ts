import { NextResponse } from 'next/server'
import { adminRefusal, fail } from '@/lib/auth/http'
import { OWNER_LOCKED_MESSAGE, isRole, removePerson, setRole } from '@/lib/auth/roles'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => fail(404, 'האדם לא נמצא', 'NOT_FOUND')
const OWNER_LOCKED = () => fail(409, OWNER_LOCKED_MESSAGE, 'OWNER_LOCKED')

/** PUT { role: 'admin' | 'member' }: a person's permission level (ENG-140). Admins only; never lowers the owner. */
async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { role?: unknown } | null
  if (!isRole(body?.role)) return fail(400, 'רמת הרשאה לא תקינה', 'BAD_ROLE')
  const result = await setRole(id, body.role)
  if (result === 'not-found') return NOT_FOUND()
  if (result === 'owner-locked') return OWNER_LOCKED()
  return NextResponse.json({ ok: true, role: body.role })
}

/** DELETE: removes a person with their devices. Admins only; never the owner. */
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  const { id } = await params
  const result = await removePerson(id)
  if (result === 'not-found') return NOT_FOUND()
  if (result === 'owner-locked') return OWNER_LOCKED()
  return NextResponse.json({ ok: true })
}

export const PUT = logged(handlePUT)
export const DELETE = logged(handleDELETE)
