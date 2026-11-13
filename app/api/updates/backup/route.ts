import { NextResponse } from 'next/server'
import { readOnlyRefusal, hasHelperToken } from '@/lib/updates/guard'
import { takeBackup } from '@/lib/updates/backup'
import { setUpdating } from '@/lib/updates/paths'
import { isSyncActive } from '@/lib/sync/runs'
import { CURRENT_VERSION } from '@/lib/updates/check'
import { parseVersion } from '@/lib/updates/version'

export const dynamic = 'force-dynamic'

const UNAUTHORIZED = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })

/**
 * The updater helper's calls (no session: lib/auth/config.ts leaves the path open and the
 * bearer token is checked here). POST { from?, to }: pause writes, back the database up,
 * answer { file, from }; 409 SYNC_RUNNING while a sync runs. DELETE: writes resume.
 *
 * The app knows its own version; the helper may not (an image without a version label sends
 * `from: 'unknown'` or nothing). So `from` only has to be x.y.z, 'unknown' or missing, and the
 * backup is always named, and answered, with CURRENT_VERSION.
 */
export async function POST(req: Request) {
  const refused = readOnlyRefusal()
  if (refused) return refused
  if (!hasHelperToken(req)) return UNAUTHORIZED()
  const body = (await req.json().catch(() => null)) as { from?: unknown; to?: unknown } | null
  const fromOk = body?.from === undefined || body.from === 'unknown' || (typeof body.from === 'string' && !!parseVersion(body.from))
  const to = typeof body?.to === 'string' ? parseVersion(body.to) : null
  if (!fromOk || !to) return NextResponse.json({ error: "to must be x.y.z; from x.y.z or 'unknown'", code: 'INVALID' }, { status: 400 })
  if (isSyncActive()) return NextResponse.json({ error: 'סנכרון רץ עכשיו. מחכים שיסתיים', code: 'SYNC_RUNNING' }, { status: 409 })
  setUpdating(true)
  try {
    return NextResponse.json({ file: await takeBackup(CURRENT_VERSION, to.join('.')), from: CURRENT_VERSION })
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
