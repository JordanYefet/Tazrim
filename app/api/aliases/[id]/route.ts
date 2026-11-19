import { NextRequest, NextResponse } from 'next/server'
import { deleteAlias } from '@/lib/db/aliases'
import { logged } from '@/lib/log/route'

async function handleDELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteAlias(id)
  return new NextResponse(null, { status: 204 })
}

export const DELETE = logged(handleDELETE)
