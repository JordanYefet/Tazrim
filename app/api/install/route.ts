import { NextResponse } from 'next/server'
import { adminRefusal } from '@/lib/auth/http'
import { getInstallView, startConfigChange } from '@/lib/install/config'
import { INSTALL_MESSAGES, INVALID_VALUE_BY_KEY } from '@/lib/install/messages'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** GET: container-level settings (ENG-121): values, whether the helper can change them, the last change */
async function handleGET() {
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  return readOnlyRefusal() ?? NextResponse.json(await getInstallView())
}

/**
 * POST { changes: { KEY: string | null } }: the helper writes .env and applies it. 202 { job },
 * or { code, key?, error } with a fixed code. Signed-in only (middleware); never in the demo.
 */
async function handlePOST(req: Request) {
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  const refused = readOnlyRefusal()
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { changes?: unknown } | null
  const view = await getInstallView()
  if (view.helper !== 'ready') return NextResponse.json({ code: 'NOT_AVAILABLE', error: INSTALL_MESSAGES.NOT_AVAILABLE }, { status: 422 })
  const r = await startConfigChange(body?.changes, view.fileValues)
  if (r.status === 202 && 'job' in r) return NextResponse.json({ job: r.job }, { status: 202 })
  const { code, key } = r as { code: string; key?: string }
  const error = (code === 'INVALID_VALUE' && key && INVALID_VALUE_BY_KEY[key]) || INSTALL_MESSAGES[code] || INSTALL_MESSAGES.HELPER_ERROR
  return NextResponse.json({ code, key, error }, { status: r.status })
}

export const GET = logged(handleGET)
export const POST = logged(handlePOST)
