import { NextResponse } from 'next/server'
import { deleteImportProfile, ProfileValidationError, updateImportProfile } from '@/lib/db/import-profiles'

type Ctx = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ error: 'המיפוי לא נמצא' }, { status: 404 })

/** Body: { name? } and/or { mapping, headerSignature } (a new mapping replaces the old one). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  const { name, mapping, headerSignature } = body as Record<string, unknown>
  if (name === undefined && mapping === undefined) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  try {
    const profile = await updateImportProfile(id, { name, mapping, headerSignature })
    return profile ? NextResponse.json({ id: profile.id, name: profile.name }) : notFound()
  } catch (e) {
    if (e instanceof ProfileValidationError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    throw e
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  return (await deleteImportProfile(id)) ? NextResponse.json({ ok: true }) : notFound()
}
