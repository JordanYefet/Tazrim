import { NextRequest, NextResponse } from 'next/server'
import { KeywordRuleError, listKeywordRules, saveKeywordRule, type FromRow } from '@/lib/db/keyword-rules'

// Contains-text category rules (lib/db/keyword-rules.ts), saved from a row's category
// window ("כל התנועות שמכילות…") or the categories page. Saving recomputes the rows the
// rule reaches; the response lists the ones that changed.

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** A row the rule was saved from, `{ source: 'card' | 'bank', id }`, or undefined */
function fromRowOf(value: unknown): FromRow | undefined {
  const v = value as { source?: unknown; id?: unknown } | null
  if (!v || (v.source !== 'card' && v.source !== 'bank') || !text(v.id)) return undefined
  return { source: v.source, id: text(v.id) }
}

export async function GET() {
  return NextResponse.json(await listKeywordRules())
}

/** { pattern, category, fromRow? }: the rule (a rule with the same text is updated), and { cardIds, bankIds } it changed */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const pattern = text(body.pattern)
  const category = text(body.category)
  if (!pattern || !category) return NextResponse.json({ error: 'חסרים טקסט או קטגוריה' }, { status: 400 })
  try {
    return NextResponse.json(await saveKeywordRule({ pattern, category, fromRow: fromRowOf(body.fromRow) }))
  } catch (e) {
    if (e instanceof KeywordRuleError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
