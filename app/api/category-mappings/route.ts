import { NextRequest, NextResponse } from 'next/server'
import { normalizeProvider } from '@/lib/db/aliases'
import { prisma } from '@/lib/db/client'
import { getIssuerCategories, removeCategoryMapping, saveCategoryMapping } from '@/lib/db/category-mappings'

// Issuer categories mapped to yours (ENG-75), per provider ("max", "cal", ...)

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export async function GET() {
  return NextResponse.json(await getIssuerCategories())
}

/** { provider, sourceCategory, category }: map the issuer's category to one of yours (an existing one). */
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const provider = text(body.provider) && normalizeProvider(text(body.provider))
  const sourceCategory = text(body.sourceCategory)
  const category = text(body.category)
  if (!provider || !sourceCategory || !category) {
    return NextResponse.json({ error: 'חסרים ספק, קטגוריה מהקובץ או קטגוריה' }, { status: 400 })
  }
  if (category !== sourceCategory && !(await prisma.category.findUnique({ where: { name: category } }))) {
    return NextResponse.json({ error: 'הקטגוריה לא נמצאה ברשימה' }, { status: 400 })
  }
  await saveCategoryMapping({ provider, sourceCategory, category })
  return NextResponse.json({ ok: true })
}

/** { provider, sourceCategory }: the rows show the issuer's name again. */
export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const provider = text(body.provider) && normalizeProvider(text(body.provider))
  const sourceCategory = text(body.sourceCategory)
  if (!provider || !sourceCategory) return NextResponse.json({ error: 'חסרים ספק או קטגוריה מהקובץ' }, { status: 400 })
  await removeCategoryMapping(provider, sourceCategory)
  return NextResponse.json({ ok: true })
}
