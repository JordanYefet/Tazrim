import { NextRequest, NextResponse } from 'next/server'
import { BankCategoryError } from '@/lib/db/bank-categories'
import { MAX_BULK, setCardCategoryMany } from '@/lib/db/bulk-category'

/**
 * `{ ids, category }` sets that (expense) category on every listed charge of
 * this card, each as its own choice: no merchant rule. All or none.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  const body = await req.json()
  const ids: unknown = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string' && id)) {
    return NextResponse.json({ error: 'לא נבחרו עסקאות' }, { status: 400 })
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ error: `אפשר לשנות עד ${MAX_BULK} עסקאות בבת אחת` }, { status: 400 })
  }
  if (typeof body.category !== 'string' || !body.category.trim()) {
    return NextResponse.json({ error: 'קטגוריה לא תקינה' }, { status: 400 })
  }
  try {
    return NextResponse.json(await setCardCategoryMany({ accountId, ids, category: body.category }))
  } catch (e) {
    if (e instanceof BankCategoryError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
