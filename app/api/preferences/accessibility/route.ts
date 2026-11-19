import { NextResponse } from 'next/server'
import { A11Y_COOKIE, A11Y_FLAGS, TEXT_SIZES, formatA11y, normalizeA11y } from '@/lib/a11y/settings'
import { getStoredA11y, storeA11y } from '@/lib/preferences/accessibility'
import { preferenceOwner } from '@/lib/preferences/owner'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** The accessibility options stored for whoever is signed in (null: none yet, the device's cookie decides) */
async function handleGET() {
  const owner = await preferenceOwner()
  if (owner === undefined) return NextResponse.json({ value: null })
  const stored = await getStoredA11y(owner)
  return NextResponse.json({ value: stored })
}

/**
 * PUT { size, font, bold, spacing, contrast, cb, still, focus, underline }: the options chosen,
 * the same on every device of that person. The cookie (tazrim_a11y) is set too, as a copy for
 * pages without a session. Where nothing can be stored (the read-only demo, no session) only the
 * cookie is set, so the demo can still change it on this device (lib/read-only.ts allows the path).
 */
async function handlePUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'הגדרות נגישות לא תקינות', code: 'INVALID' }, { status: 400 })
  }
  if (typeof body.size !== 'number' || !(TEXT_SIZES as readonly number[]).includes(body.size) || A11Y_FLAGS.some(f => typeof body[f] !== 'boolean')) {
    return NextResponse.json({ error: 'הגדרות נגישות לא תקינות', code: 'INVALID' }, { status: 400 })
  }
  const setting = normalizeA11y(body)
  const owner = await preferenceOwner()
  const stored = owner === undefined ? setting : await storeA11y(owner, setting)
  const res = NextResponse.json({ value: stored })
  res.cookies.set({
    name: A11Y_COOKIE,
    value: formatA11y(stored),
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}

export const GET = logged(handleGET)
export const PUT = logged(handlePUT)
