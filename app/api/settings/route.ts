// app/api/settings/route.ts
import { logged } from '@/lib/log/route'
import { NextResponse } from 'next/server'
import { getCushion, setCushion, SettingValidationError } from '@/lib/db/settings'

export const dynamic = 'force-dynamic'

/** The app's preferences: { cushion } (the projection page's safety cushion, ₪). */
async function handleGET() {
  return NextResponse.json({ cushion: await getCushion() })
}

/** Body: { cushion: number }. 200 with the saved value, 400 with { error } in Hebrew. */
export const PUT = logged(async function PUT(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  try {
    return NextResponse.json({ cushion: await setCushion((body as { cushion?: unknown }).cushion) })
  } catch (e) {
    if (e instanceof SettingValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})

export const GET = logged(handleGET)
