import { NextResponse } from 'next/server'
import { parseManualInput, previewManualSeries } from '@/lib/db/manual-recurring'
import { getRecurringSeries } from '@/lib/db/recurring'

/**
 * POST /api/recurring/manual/preview (ENG-71): what a rule would match, before saving.
 * { accountId, seriesId?, cadence, pattern, dayFrom, dayTo, attachedIds, detachedIds }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.accountId !== 'string') {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const parsed = parseManualInput({ ...body, name: 'preview' })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const v = parsed.value
  const seriesId = typeof body.seriesId === 'string' ? body.seriesId : null

  // rows now in a detected series (they would move to this one)
  const overview = await getRecurringSeries({ accountId: body.accountId })
  const detectedNames = new Map<string, string>()
  for (const s of overview.series) {
    if (s.manual || s.status === 'dismissed') continue
    for (const id of s.transactionIds) detectedNames.set(id, s.name)
  }

  const preview = await previewManualSeries(
    {
      accountId: body.accountId,
      seriesId,
      cadence: v.cadence!,
      pattern: v.pattern ?? '',
      dayFrom: v.dayFrom ?? null,
      dayTo: v.dayTo ?? null,
      attachedIds: v.attachedIds ?? [],
      detachedIds: v.detachedIds ?? [],
    },
    detectedNames
  )
  if (!preview) return NextResponse.json({ error: 'החשבון לא נמצא' }, { status: 404 })
  return NextResponse.json(preview)
}
