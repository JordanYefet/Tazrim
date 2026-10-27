import { NextRequest, NextResponse } from 'next/server'
import { normalizeProvider } from '@/lib/db/aliases'
import { BankCategoryError, removeBankCategoryRule, setBankDescriptionRule } from '@/lib/db/bank-categories'

// A bank description's category rule, added or removed from the categories page
// (the bank table adds them too: "כל התנועות ...")

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** { provider, originalDescription, direction, category }: the rule, applied to the rows not set by hand */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const provider = text(body.provider) && normalizeProvider(text(body.provider))
  const originalDescription = text(body.originalDescription)
  const direction = body.direction === 'IN' || body.direction === 'OUT' ? body.direction : ''
  const category = text(body.category)
  if (!provider || !originalDescription || !direction || !category) {
    return NextResponse.json({ error: 'חסרים ספק, תיאור, כיוון או קטגוריה' }, { status: 400 })
  }
  try {
    return NextResponse.json(await setBankDescriptionRule({ provider, originalDescription, direction, category }))
  } catch (e) {
    if (e instanceof BankCategoryError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

/** { provider, originalDescription, direction }: the rule goes, and the categories it set are cleared */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const provider = text(body.provider) && normalizeProvider(text(body.provider))
  const originalDescription = text(body.originalDescription)
  const direction = body.direction === 'IN' || body.direction === 'OUT' ? body.direction : ''
  if (!provider || !originalDescription || !direction) {
    return NextResponse.json({ error: 'חסרים ספק, תיאור או כיוון' }, { status: 400 })
  }
  await removeBankCategoryRule({ provider, originalDescription, direction })
  return NextResponse.json({ ok: true })
}
