import { NextRequest, NextResponse } from 'next/server'
import { parseCategoryKind } from '@/lib/db/categories'
import { previewKeywordRule } from '@/lib/db/keyword-rules'
import { isKeywordScope } from '@/lib/insights/keyword-rules'

/**
 * `?pattern=&kind=EXPENSE|INCOME[&scope=ANY|NAME|NOTES][&merchant=]`: how many rows the text reaches for a category of that
 * kind ({ matches, applies }), for the live count beside the text field. A GET, so it
 * works in read-only mode too.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const kind = parseCategoryKind(sp.get('kind'))
  if (!kind) return NextResponse.json({ error: 'סוג קטגוריה לא תקין' }, { status: 400 })
  const scope = sp.get('scope')
  return NextResponse.json(
    await previewKeywordRule(sp.get('pattern') ?? '', kind, {
      scope: isKeywordScope(scope) ? scope : 'ANY',
      merchant: sp.get('merchant')?.trim() || null,
    })
  )
}
