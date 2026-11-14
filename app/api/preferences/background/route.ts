import { NextResponse } from 'next/server'
import { BACKGROUND_KINDS, BACKGROUND_PALETTES, formatBackgroundCookie, parseBackgroundCookie } from '@/lib/background/setting'
import { getStoredBackground, storeBackground } from '@/lib/preferences/background'
import { preferenceOwner } from '@/lib/preferences/owner'
import { readOnlyRefusal } from '@/lib/updates/guard'

export const dynamic = 'force-dynamic'

const KINDS = BACKGROUND_KINDS.map(k => k.value).join('|')
const PALETTES = BACKGROUND_PALETTES.map(p => p.value).join('|')
/** "<kind>.<strength>.<palette>", the cookie's format */
const VALUE = new RegExp(`^(${KINDS})\\.\\d{1,3}\\.(${PALETTES})$`)

/** The page background stored for whoever is signed in (null: none yet, the device's cookie decides) */
export async function GET() {
  const owner = await preferenceOwner()
  if (owner === undefined) return NextResponse.json({ value: null })
  const stored = await getStoredBackground(owner)
  return NextResponse.json({ value: stored ? formatBackgroundCookie(stored) : null })
}

/** PUT { value: "lines.10.indigo-pink" }: the background chosen, the same on every device of that person */
export async function PUT(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  const owner = await preferenceOwner()
  if (owner === undefined) return NextResponse.json({ error: 'צריך להתחבר', code: 'UNAUTHORIZED' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null
  if (typeof body?.value !== 'string' || !VALUE.test(body.value)) {
    return NextResponse.json({ error: 'רקע לא מוכר', code: 'INVALID' }, { status: 400 })
  }
  const setting = parseBackgroundCookie(body.value)
  await storeBackground(owner, setting)
  return NextResponse.json({ value: formatBackgroundCookie(setting) })
}
