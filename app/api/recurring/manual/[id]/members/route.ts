import { NextResponse } from 'next/server'
import { setManualMember } from '@/lib/db/manual-recurring'

/**
 * POST /api/recurring/manual/:id/members (ENG-71)
 * { transactionId, mode: 'attach' | 'detach' }: add one transaction to the series by
 * hand, or keep it out even when the rule matches.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.transactionId !== 'string' || !body.transactionId || !['attach', 'detach'].includes(body.mode)) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const result = await setManualMember(id, body.transactionId, body.mode)
  if (result.status === 'not_found') return NextResponse.json({ error: 'החיוב הקבוע לא נמצא' }, { status: 404 })
  if (result.status === 'invalid') return NextResponse.json({ error: result.error }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}
