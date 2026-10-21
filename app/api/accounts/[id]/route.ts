import { NextResponse } from 'next/server'
import { AccountValidationError, deleteAccount, updateAccount } from '@/lib/db/accounts'
import { providerLabel } from '@/lib/accounts/brands'

type Ctx = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ error: 'החשבון לא נמצא' }, { status: 404 })

/**
 * Body: any of { displayName, provider, cardLastFour, cardNetwork, color,
 * archived }, at least one; every field is validated before anything is saved.
 * Changing the provider of an account that has transactions needs
 * `confirmProviderChange: true` (409 PROVIDER_CHANGE_UNCONFIRMED otherwise),
 * since merchant rules are keyed by provider.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  try {
    const result = await updateAccount(id, body as Record<string, unknown>)
    switch (result.status) {
      case 'nothing_to_update':
        return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
      case 'not_found':
        return notFound()
      case 'provider_change_unconfirmed':
        return NextResponse.json(
          {
            error: `כללי בתי העסק נשמרים לפי ספק. שינוי מ${providerLabel(result.from)} ל${providerLabel(result.to)} צריך אישור.`,
            code: 'PROVIDER_CHANGE_UNCONFIRMED',
            field: 'provider',
            transactionCount: result.transactionCount,
            ruleCount: result.ruleCount,
          },
          { status: 409 }
        )
      case 'updated':
        return NextResponse.json(result.account)
    }
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
