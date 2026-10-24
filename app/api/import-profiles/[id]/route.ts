import { NextResponse } from 'next/server'
import {
  deleteImportProfile,
  getProfileForEdit,
  ProfileValidationError,
  updateImportProfile,
} from '@/lib/db/import-profiles'
import { getAccount } from '@/lib/db/accounts'

type Ctx = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ error: 'המיפוי לא נמצא' }, { status: 404 })

/**
 * The profile for the file-less mapper (ENG-69): its mapping and the stored
 * header snapshot (header row + sample rows). `snapshot` is null when the
 * header can't be rebuilt; the mapper then needs a file once.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const found = await getProfileForEdit(id)
  if (!found) return notFound()
  const { profile, kind, mapping, snapshot } = found
  const account = profile.accountId ? await getAccount(profile.accountId) : null
  return NextResponse.json({
    id: profile.id,
    name: profile.name,
    accountKind: profile.accountKind,
    provider: profile.provider,
    account: account ? { id: account.id, displayName: account.displayName } : null,
    kind,
    mapping,
    snapshot,
  })
}

/**
 * Body: { name? } and/or { mapping } (a new mapping replaces the old one).
 * A mapping made on a file adds that file's { headerSignature, headers? };
 * without them (edited from the stored header, ENG-69) the stored ones stay.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  const { name, mapping, headerSignature, headers } = body as Record<string, unknown>
  if (name === undefined && mapping === undefined) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  try {
    const profile = await updateImportProfile(id, { name, mapping, headerSignature, headers })
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
