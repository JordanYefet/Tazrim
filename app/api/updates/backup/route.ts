import { NextResponse } from 'next/server'
import { readOnlyRefusal, hasHelperToken } from '@/lib/updates/guard'
import { takeBackup } from '@/lib/updates/backup'
import { setUpdating } from '@/lib/updates/paths'
import { isSyncActive } from '@/lib/sync/runs'
import { parseVersion } from '@/lib/updates/version'

export const dynamic = 'force-dynamic'

const UNAUTHORIZED = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })

/**
 * The updater helper's calls (no session: lib/auth/config.ts leaves the path open and the
 * bearer token is checked here). POST { from, to }: pause writes, back the database up,
 * answer { file }; 409 SYNC_RUNNING while a sync runs. DELETE: writes resume.
 */
export async function POST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  if (!hasHelperToken(req)) return UNAUTHORIZED()
  const body = (await req.json().catch(() => null)) as { from?: unknown; to?: unknown } | null
  const from = typeof body?.from === 'string' ? parseVersion(body.from) : null
  const to = typeof body?.to === 'string' ? parseVersion(body.to) : null
  if (!from || !to) return NextResponse.json({ error: 'from and to must be x.y.z', code: 'INVALID' }, { status: 400 })
  if (isSyncActive()) return NextResponse.json({ error: 'סנכרון רץ עכשיו. מחכים שיסתיים', code: 'SYNC_RUNNING' }, { status: 409 })
  setUpdating(true)
  try {
    return NextResponse.json({ file: await takeBackup(from.join('.'), to.join('.')) })
  } catch (e) {
    setUpdating(false)
    console.error('updates: backup failed', e)
    return NextResponse.json({ error: 'הגיבוי נכשל', code: 'BACKUP_FAILED' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  if (!hasHelperToken(req)) return UNAUTHORIZED()
  setUpdating(false)
  return NextResponse.json({ ok: true })
}
