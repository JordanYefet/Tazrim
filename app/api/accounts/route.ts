import { NextResponse } from 'next/server'
import { AccountValidationError, createAccount, listAccountsWithCounts } from '@/lib/db/accounts'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** Every account, archived included, with transaction and upload counts. */
async function handleGET() {
  return NextResponse.json(await listAccountsWithCounts())
}

/**
 * Body: { kind: 'BANK' | 'CREDIT_CARD', provider, displayName, cardLastFour?, cardNetwork?, color?,
 * payerAccountId? (cards: a non-archived bank account id, or null), paidCardIds? (bank accounts:
 * non-archived card ids, linked to the new account) }. 201 with the account.
 */
async function handlePOST(req: Request) {
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

export const GET = logged(handleGET)
export const POST = logged(handlePOST)
