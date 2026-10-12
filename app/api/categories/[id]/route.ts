import { NextRequest, NextResponse } from 'next/server'
import { renameCategory, deleteCategory } from '@/lib/db/categories'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם קטגוריה נדרש' }, { status: 400 })
  const category = await renameCategory(id, name.trim())
  return NextResponse.json(category)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteCategory(id)
  return NextResponse.json({ ok: true })
}
