import { NextRequest, NextResponse } from 'next/server'
import { normalizeProvider } from '@/lib/db/aliases'
import { removeBankCategoryRule } from '@/lib/db/bank-categories'

// A bank description's category rule, removed from the categories page
// (rules are created from the bank table: "כל התנועות ...")

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

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
