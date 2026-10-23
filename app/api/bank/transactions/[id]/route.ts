import { NextRequest, NextResponse } from 'next/server'
import { updateBankTransaction } from '@/lib/db/bank'
import { BankCategoryError, setBankCategory } from '@/lib/db/bank-categories'

/**
 * `category` (a name, or null to clear) with `categoryScope` 'row' | 'rule'
 * sets the row's category (lib/db/bank-categories); the response then lists
 * every row it changed. Other fields edit the row itself.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  if (body.category !== undefined) {
    const scope = body.categoryScope
    if (scope !== 'row' && scope !== 'rule') return NextResponse.json({ error: 'categoryScope נדרש' }, { status: 400 })
    if (body.category !== null && (typeof body.category !== 'string' || !body.category.trim())) {
      return NextResponse.json({ error: 'קטגוריה לא תקינה' }, { status: 400 })
    }
    try {
      return NextResponse.json(await setBankCategory({ id, category: body.category, scope }))
    } catch (e) {
      if (e instanceof BankCategoryError) return NextResponse.json({ error: e.message }, { status: e.status })
      throw e
    }
  }

  const updated = await updateBankTransaction(id, {
    description: body.description,
    note: body.note,
    ignored: body.ignored,
  })
  return NextResponse.json(updated)
}
