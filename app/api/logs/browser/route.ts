import { NextResponse } from 'next/server'
import { logsRefusal } from '@/lib/log/access'
import { getShowBrowser, inDocker, setShowBrowser } from '@/lib/log/browser-flag'
import { log } from '@/lib/log/logger'

export const dynamic = 'force-dynamic'

const IN_DOCKER = { error: 'ב-Docker הדפדפן רץ בלי מסך, אז אי אפשר להציג אותו', code: 'IN_DOCKER' }

/** GET: whether the sync's browser window is shown, and whether this server could show one at all */
export async function GET(req: Request) {
  const refused = logsRefusal(req.headers)
  if (refused) return refused
  return NextResponse.json({ show: getShowBrowser(), inDocker: inDocker() })
}

/** PUT { show: boolean }: the next syncs open their browser window (until the server restarts) */
export async function PUT(req: Request) {
  const refused = logsRefusal(req.headers)
  if (refused) return refused
  if (inDocker()) return NextResponse.json(IN_DOCKER, { status: 409 })
  const body = (await req.json().catch(() => null)) as { show?: unknown } | null
  if (typeof body?.show !== 'boolean') return NextResponse.json({ error: 'ערך לא תקין', code: 'INVALID' }, { status: 400 })
  setShowBrowser(body.show)
  log.info('app', body.show ? 'sync browser shown' : 'sync browser hidden')
  return NextResponse.json({ show: body.show, inDocker: false })
}
