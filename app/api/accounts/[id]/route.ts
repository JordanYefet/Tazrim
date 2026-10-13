import { NextResponse } from 'next/server'
import { AccountValidationError, deleteAccount, getAccount, renameAccount, setArchived } from '@/lib/db/accounts'

type Ctx = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ error: 'החשבון לא נמצא' }, { status: 404 })

/** Body: { displayName?: string, archived?: boolean }, at least one. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  const { displayName, archived } = body as { displayName?: unknown; archived?: unknown }
  if (displayName === undefined && archived === undefined) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }
  if (archived !== undefined && typeof archived !== 'boolean') {
    return NextResponse.json({ error: 'ערך ארכיון לא תקין', field: 'archived' }, { status: 400 })
  }
  try {
    if (!(await getAccount(id))) return notFound()
    let account = null
    if (displayName !== undefined) account = await renameAccount(id, displayName)
    if (archived !== undefined) account = await setArchived(id, archived)
    return account ? NextResponse.json(account) : notFound()
  } catch (e) {
    if (e instanceof AccountValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    }
    throw e
  }
}

/**
 * Body (optional): { confirm?: string }, the account's display name, required
 * when it has transactions. 409 with code LAST_OF_KIND or CONFIRMATION_REQUIRED.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  const result = await deleteAccount(id, { confirmName: body?.confirm })
  switch (result.status) {
    case 'not_found':
      return notFound()
    case 'last_of_kind':
      return NextResponse.json(
        { error: 'אי אפשר למחוק את החשבון האחרון מסוגו. אפשר להעביר אותו לארכיון.', code: 'LAST_OF_KIND' },
        { status: 409 }
      )
    case 'confirmation_required':
      return NextResponse.json(
        { error: 'יש להקליד את שם החשבון כדי לאשר את המחיקה', code: 'CONFIRMATION_REQUIRED' },
        { status: 409 }
      )
    case 'deleted':
      return NextResponse.json({ ok: true, deleted: result.deleted })
  }
}
