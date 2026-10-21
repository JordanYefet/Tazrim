import { NextResponse } from 'next/server'
import { getAccount } from '@/lib/db/accounts'
import { createImportProfile, listImportProfiles, ProfileValidationError } from '@/lib/db/import-profiles'
import { toProfileView } from '@/lib/import/profile-view'

/** Saved column mappings, newest first. */
export async function GET() {
  return NextResponse.json((await listImportProfiles()).map(toProfileView))
}

/**
 * Body: { accountId, name, mapping, headerSignature, headers?, linkAccount? }.
 * Kind and provider come from the account; the mapping is validated for its
 * kind. `headers` (a HeaderSnapshot, ENG-69) must match `headerSignature`.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  const { accountId, name, mapping, headerSignature, headers, linkAccount } = body as Record<string, unknown>
  if (typeof accountId !== 'string') return NextResponse.json({ error: 'לא נבחר חשבון' }, { status: 400 })
  if (linkAccount !== undefined && typeof linkAccount !== 'boolean') {
    return NextResponse.json({ error: 'ערך לא תקין', field: 'linkAccount' }, { status: 400 })
  }
  const account = await getAccount(accountId)
  if (!account) return NextResponse.json({ error: 'החשבון לא נמצא', code: 'ACCOUNT_NOT_FOUND' }, { status: 404 })
  try {
    const profile = await createImportProfile(account, { name, mapping, headerSignature, headers, linkAccount })
    return NextResponse.json(toProfileView({ ...profile, account: linkAccount ? account : null }), { status: 201 })
  } catch (e) {
    if (e instanceof ProfileValidationError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    throw e
  }
}
