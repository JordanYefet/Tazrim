import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/auth/http'
import { isAuthRequired } from '@/lib/auth/config'
import { READ_ONLY_MESSAGE, isReadOnly } from '@/lib/read-only'
import { SettingError, setAppSetting, type SettingName } from '@/lib/settings/app-settings'

export const dynamic = 'force-dynamic'

const NAMES: SettingName[] = ['timeZone', 'vaultIdleMinutes', 'syncConcurrency', 'origins', 'requireHttps']

/** PUT { name, value }: saves one app setting (value null = back to the default). Signed in only; never in the demo. */
export async function PUT(req: Request) {
  if (isReadOnly()) return NextResponse.json({ error: READ_ONLY_MESSAGE, readOnly: true }, { status: 403 })
  if (isAuthRequired() && !(await currentSession())) return NextResponse.json({ error: 'צריך להתחבר', code: 'SIGNED_OUT' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { name?: unknown; value?: unknown } | null
  const name = NAMES.find(n => n === body?.name)
  const v = body?.value
  if (!name || !(v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
    return NextResponse.json({ error: 'בקשה לא תקינה', code: 'INVALID' }, { status: 400 })
  }
  try {
    await setAppSetting(name, v)
  } catch (e) {
    if (e instanceof SettingError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'LOCKED' ? 409 : 400 })
    throw e
  }
  return NextResponse.json({ ok: true })
}
