import { NextRequest, NextResponse } from 'next/server'
import { renameRecurring, setRecurringStatus, type RecurringStatusValue } from '@/lib/db/recurring'

const STATUSES: (RecurringStatusValue | null)[] = ['confirmed', 'dismissed', null]

/**
 * POST /api/recurring/overrides
 * { key, baseKey, accountId?, overrideKey?, status?: 'confirmed' | 'dismissed' | null, displayName?: string | null }
 * `status` and `displayName` are each applied only when present; null undoes them.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.key !== 'string' || !body.key || typeof body.baseKey !== 'string' || !body.baseKey) {
    return NextResponse.json({ error: 'חסר מזהה סדרה' }, { status: 400 })
  }
  const target = {
    key: body.key,
    baseKey: body.baseKey,
    accountId: typeof body.accountId === 'string' ? body.accountId : null,
    overrideKey: typeof body.overrideKey === 'string' ? body.overrideKey : null,
  }

  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'סטטוס לא מוכר' }, { status: 400 })
    await setRecurringStatus(target, body.status)
  }
  if ('displayName' in body) {
    if (body.displayName !== null && typeof body.displayName !== 'string') {
      return NextResponse.json({ error: 'שם לא תקין' }, { status: 400 })
    }
    // a status write above has already moved a base-key match onto `key`
    await renameRecurring({ ...target, overrideKey: 'status' in body ? null : target.overrideKey }, body.displayName)
  }
  return new NextResponse(null, { status: 204 })
}
