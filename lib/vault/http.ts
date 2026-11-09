import { NextResponse } from 'next/server'
import { currentSession, fail } from '@/lib/auth/http'
import { prisma } from '@/lib/db/client'
import { VaultLockedError } from './vault'

/** The signed-in person, or the 401 to answer with */
export async function sessionOr401() {
  const session = await currentSession()
  return session ?? fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse

/** Runs `fn`, answering 423 when the vault is locked */
export async function whileOpen(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof VaultLockedError) return fail(423, 'הכספת נעולה. פתחו אותה ונסו שוב', 'VAULT_LOCKED')
    throw e
  }
}

/** The label and account a request names, checked; or the error */
export async function readDetails(body: { label?: unknown; accountId?: unknown } | null, kind: string) {
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : ''
  if (!label) return fail(400, 'חסר שם', 'BAD_LABEL')
  let accountId: string | null = null
  if (typeof body?.accountId === 'string' && body.accountId) {
    const account = await prisma.account.findUnique({ where: { id: body.accountId }, select: { id: true, kind: true } })
    if (!account || account.kind !== kind) return fail(400, 'החשבון לא מתאים לחברה הזו', 'BAD_ACCOUNT')
    accountId = account.id
  }
  return { label, accountId }
}

