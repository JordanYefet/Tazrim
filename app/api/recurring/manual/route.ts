import { NextResponse } from 'next/server'
import { createManualSeries, parseManualInput, type ManualSeriesInput } from '@/lib/db/manual-recurring'

/**
 * POST /api/recurring/manual (ENG-71)
 * { accountId, name, cadence: 'monthly' | 'bimonthly' | 'yearly', pattern?, dayFrom?, dayTo?,
 *   attachedIds?, detachedIds?, replaceOverrideKeys? } → 201 { id }
 * `replaceOverrideKeys`: override keys of a detected series this one takes over.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  if (typeof body.accountId !== 'string' || !body.accountId) return NextResponse.json({ error: 'חסר חשבון' }, { status: 400 })
  const parsed = parseManualInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const input: ManualSeriesInput = {
    name: parsed.value.name!,
    cadence: parsed.value.cadence!,
    pattern: parsed.value.pattern ?? '',
    dayFrom: parsed.value.dayFrom ?? null,
    dayTo: parsed.value.dayTo ?? null,
    attachedIds: parsed.value.attachedIds ?? [],
    detachedIds: parsed.value.detachedIds ?? [],
  }
  const replaceOverrideKeys = Array.isArray(body.replaceOverrideKeys)
    ? body.replaceOverrideKeys.filter((k: unknown): k is string => typeof k === 'string')
    : []
  const result = await createManualSeries(body.accountId, input, { replaceOverrideKeys })
  if (result.status === 'not_found') return NextResponse.json({ error: 'החשבון לא נמצא' }, { status: 404 })
  if (result.status === 'invalid') return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ id: result.id }, { status: 201 })
}
