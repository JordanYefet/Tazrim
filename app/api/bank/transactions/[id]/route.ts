import { NextRequest, NextResponse } from 'next/server'
import { updateBankTransaction } from '@/lib/db/bank'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const updated = await updateBankTransaction(id, {
    description: body.description,
    note: body.note,
    ignored: body.ignored,
  })
  return NextResponse.json(updated)
}
