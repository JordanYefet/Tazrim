import { NextResponse } from 'next/server'
import { getAccount } from '@/lib/db/accounts'
import { setImportMode } from '@/lib/db/import-profiles'

type Ctx = { params: Promise<{ id: string }> }

/**
 * ENG-69. Body: { mode: 'custom' | 'builtin' }. `custom` makes a Leumi or Max
 * account import through its linked mapping (seeded from the built-in layout
 * when it has none); `builtin` goes back to the built-in parser and keeps the
 * mapping for next time. 422 NO_BUILT_IN for providers without a built-in importer.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null
  const mode = body?.mode
  if (mode !== 'custom' && mode !== 'builtin') return NextResponse.json({ error: 'מצב ייבוא לא תקין' }, { status: 400 })
  const account = await getAccount(id)
  if (!account) return NextResponse.json({ error: 'החשבון לא נמצא' }, { status: 404 })
  const result = await setImportMode(account, mode)
  if (!result) {
    return NextResponse.json({ error: 'לספק הזה אין ייבוא מובנה', code: 'NO_BUILT_IN' }, { status: 422 })
  }
  return NextResponse.json({
    customImport: result.customImport,
    profile: result.profile ? { id: result.profile.id, name: result.profile.name } : null,
  })
}
