import { NextRequest, NextResponse } from 'next/server'
import { deleteAlias } from '@/lib/db/aliases'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteAlias(id)
  return new NextResponse(null, { status: 204 })
}
