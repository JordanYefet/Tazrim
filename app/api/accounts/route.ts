import { NextResponse } from 'next/server'
import { AccountValidationError, createAccount, listAccountsWithCounts } from '@/lib/db/accounts'

export const dynamic = 'force-dynamic'

/** Every account, archived included, with transaction and upload counts. */
export async function GET() {
  return NextResponse.json(await listAccountsWithCounts())
}

/** Body: { kind: 'BANK' | 'CREDIT_CARD', provider, displayName, cardLastFour? }. 201 with the account. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  try {
    const account = await createAccount(body)
    return NextResponse.json(account, { status: 201 })
  } catch (e) {
    if (e instanceof AccountValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 })
    }
    throw e
  }
}
