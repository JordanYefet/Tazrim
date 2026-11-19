import { logged } from '@/lib/log/route'
import { NextRequest, NextResponse } from 'next/server'
import { getCategories, createCategory, parseCategoryKind } from '@/lib/db/categories'

/** `?kind=EXPENSE|INCOME` narrows the list */
async function handleGET(req: NextRequest) {
  const categories = await getCategories(parseCategoryKind(req.nextUrl.searchParams.get('kind')))
  return NextResponse.json(categories)
}

export const POST = logged(async function POST(req: NextRequest) {
  const { name, kind } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם קטגוריה נדרש' }, { status: 400 })
  if (kind !== undefined && !parseCategoryKind(kind)) return NextResponse.json({ error: 'סוג קטגוריה לא תקין' }, { status: 400 })
  const category = await createCategory(name.trim(), parseCategoryKind(kind))
  return NextResponse.json(category)
})

export const GET = logged(handleGET)
