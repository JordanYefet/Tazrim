import { NextResponse } from 'next/server'
import { deleteManualSeries, parseManualInput, updateManualSeries } from '@/lib/db/manual-recurring'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/recurring/manual/:id (ENG-71)
 * Any of { name, cadence, pattern, dayFrom, dayTo, attachedIds, detachedIds }.
 * The id lists, when given, replace the transactions attached / detached by hand.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const parsed = parseManualInput(body, { partial: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const result = await updateManualSeries(id, parsed.value)
  if (result.status === 'not_found') return NextResponse.json({ error: 'החיוב הקבוע לא נמצא' }, { status: 404 })
  if (result.status === 'invalid') return NextResponse.json({ error: result.error }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}

/** DELETE /api/recurring/manual/:id: removes the series; its transactions go back to detection */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!(await deleteManualSeries(id))) return NextResponse.json({ error: 'החיוב הקבוע לא נמצא' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
