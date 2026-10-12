import { NextRequest, NextResponse } from 'next/server'
import { deleteUpload } from '@/lib/db/upload'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteUpload(id)
  return NextResponse.json({ ok: true })
}
