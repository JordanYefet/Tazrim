import { NextRequest, NextResponse } from 'next/server'
import { renameCategory, deleteCategory } from '@/lib/db/categories'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם קטגוריה נדרש' }, { status: 400 })
  try {
    return NextResponse.json(await renameCategory(id, name.trim()))
  } catch (e) {
    // The name is unique: another category already has it
    if ((e as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'שם כבר קיים' }, { status: 400 })
    throw e
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteCategory(id)
  return NextResponse.json({ ok: true })
}
