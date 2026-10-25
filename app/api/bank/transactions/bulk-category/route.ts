import { NextRequest, NextResponse } from 'next/server'
import { BankCategoryError, setBankCategoryMany } from '@/lib/db/bank-categories'

/** More than a table loads at once; bounds the one transaction and its IN list */
const MAX_IDS = 500

/**
 * `{ ids, category }` (a name, or null to clear) sets that category on every
 * listed row as a manual choice (lib/db/bank-categories); all or none.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const ids: unknown = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string' && id)) {
    return NextResponse.json({ error: 'לא נבחרו תנועות' }, { status: 400 })
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `אפשר לשנות עד ${MAX_IDS} תנועות בבת אחת` }, { status: 400 })
  }
  if (body.category !== null && (typeof body.category !== 'string' || !body.category.trim())) {
    return NextResponse.json({ error: 'קטגוריה לא תקינה' }, { status: 400 })
  }
  try {
    return NextResponse.json(await setBankCategoryMany({ ids, category: body.category }))
  } catch (e) {
    if (e instanceof BankCategoryError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
