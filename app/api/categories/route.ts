import { NextRequest, NextResponse } from 'next/server'
import { getCategories, createCategory } from '@/lib/db/categories'

export async function GET() {
  const categories = await getCategories()
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם קטגוריה נדרש' }, { status: 400 })
  const category = await createCategory(name.trim())
  return NextResponse.json(category)
}
