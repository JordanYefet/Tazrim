import { NextRequest, NextResponse } from 'next/server'
import { BankCategoryError } from '@/lib/db/bank-categories'
import { bulkTargetsFor, MAX_BULK, setCategoryMany, type BulkTargets } from '@/lib/db/bulk-category'
import { hasCriteria, parseSearchParams } from '@/lib/search/query'

const TOO_MANY = `החיפוש מוצא יותר מ-${MAX_BULK} תנועות: צמצמו אותו כדי לבחור את כולן`

/** Every row a search's params match that can take a category, or a response saying why not */
async function targetsOf(query: URLSearchParams) {
  const filters = parseSearchParams(query)
  if (!hasCriteria(filters) || filters.amountInvalid) {
    return NextResponse.json({ error: 'אין חיפוש לבחור ממנו' }, { status: 400 })
  }
  return (await bulkTargetsFor(filters)) ?? NextResponse.json({ error: TOO_MANY }, { status: 400 })
}

/**
 * GET /api/search/bulk-category?<search params> — what "select all" would take:
 * { bankOut, bankIn, card } counts, so the window offers the right categories.
 */
export async function GET(req: NextRequest) {
  const targets = await targetsOf(req.nextUrl.searchParams)
  if (targets instanceof NextResponse) return targets
  return NextResponse.json({ bankOut: targets.bankOut, bankIn: targets.bankIn, card: targets.cardIds.length })
}

type Key = { source: 'bank' | 'card'; id: string }

function keys(v: unknown): Key[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v)) return null
  return v.every(k => k && (k.source === 'bank' || k.source === 'card') && typeof k.id === 'string' && k.id) ? v : null
}

/**
 * PATCH { category, items: [{ source, id }] } — those rows;
 * or { category, query: "<search params>", exclude?: [{ source, id }] } — every match but those.
 * Each row gets the category as its own choice; card charges need an expense one.
 * -> { bankIds, cardIds } changed
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  if (body.category !== null && (typeof body.category !== 'string' || !body.category.trim())) {
    return NextResponse.json({ error: 'קטגוריה לא תקינה' }, { status: 400 })
  }
  const items = keys(body.items)
  const exclude = keys(body.exclude)
  if (!items || !exclude) return NextResponse.json({ error: 'בחירה לא תקינה' }, { status: 400 })

  let targets: BulkTargets
  if (typeof body.query === 'string') {
    const all = await targetsOf(new URLSearchParams(body.query))
    if (all instanceof NextResponse) return all
    const out = new Set(exclude.map(k => `${k.source}:${k.id}`))
    targets = {
      bankIds: all.bankIds.filter(id => !out.has(`bank:${id}`)),
      cardIds: all.cardIds.filter(id => !out.has(`card:${id}`)),
    }
  } else {
    targets = {
      bankIds: items.filter(k => k.source === 'bank').map(k => k.id),
      cardIds: items.filter(k => k.source === 'card').map(k => k.id),
    }
  }

  try {
    return NextResponse.json(await setCategoryMany({ ...targets, category: body.category }))
  } catch (e) {
    if (e instanceof BankCategoryError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
