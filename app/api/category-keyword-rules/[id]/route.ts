import { NextRequest, NextResponse } from 'next/server'
import { deleteKeywordRules, KeywordRuleError, saveKeywordRule } from '@/lib/db/keyword-rules'
import { prisma } from '@/lib/db/client'
import { isKeywordScope } from '@/lib/insights/keyword-rules'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** { pattern?, category?, scope?, merchant? }: edits the rule and recomputes the rows the old and new text reach */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const rule = await prisma.categoryKeywordRule.findUnique({ where: { id } })
  if (!rule) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  try {
    return NextResponse.json(
      await saveKeywordRule({
        id,
        pattern: text(body.pattern) || rule.pattern,
        category: text(body.category) || rule.category,
        scope: isKeywordScope(body.scope) ? body.scope : isKeywordScope(rule.scope) ? rule.scope : 'ANY',
        // An empty string clears the limit; left out keeps it
        merchant: body.merchant === undefined ? rule.merchant : text(body.merchant) || null,
      })
    )
  } catch (e) {
    if (e instanceof KeywordRuleError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

/** The rule goes; the rows it set take an exact rule's category, another contains rule's, or none */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rule = await prisma.categoryKeywordRule.findUnique({ where: { id } })
  if (!rule) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  return NextResponse.json(await deleteKeywordRules([id]))
}
