import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { isLocalRequest } from '@/lib/local-request'
import { isReadOnly } from '@/lib/read-only'
import { SYNC_COMPANIES, VERIFIED_COMPANIES, syncCompany, validateCredentials } from '@/lib/sync/providers'
import { currentRun, startRun } from '@/lib/sync/runs'
import { earliestStart, sourceSummary } from '@/lib/sync/store'

export const dynamic = 'force-dynamic'

/** Until there is a login and HTTPS (ENG-89), a bank password may only be typed on the machine the app runs on. */
const NOT_LOCAL = { error: 'בשלב הזה אפשר לסנכרן רק מהמחשב שעליו האפליקציה רצה', code: 'NOT_LOCAL' }

/**
 * GET: what the sync sheet shows (ENG-91): whether this device may sync, the
 * companies (the household's own first, with their last sync and default
 * start) and the latest run.
 */
export async function GET(req: Request) {
  const available = !isReadOnly() && isLocalRequest(req.headers)
  const accounts = await prisma.account.findMany({
    where: { archived: false, kind: { in: ['BANK', 'CREDIT_CARD'] } },
    select: { kind: true, provider: true },
  })
  const companies = await Promise.all(
    SYNC_COMPANIES.map(async c => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      fields: c.fields,
      otp: !!c.otp,
      historyMonths: c.historyMonths,
      provenMonths: c.provenMonths ?? null,
      verified: VERIFIED_COMPANIES.has(c.id),
      hasAccounts: accounts.some(a => a.kind === c.kind && a.provider === c.provider),
      ...(await sourceSummary(c)),
    }))
  )
  return NextResponse.json({ available, companies, run: currentRun() })
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** POST { company, credentials, startDate: YYYY-MM-DD }: starts a sync. 409 while another one runs. */
export async function POST(req: Request) {
  if (!isLocalRequest(req.headers)) return NextResponse.json(NOT_LOCAL, { status: 403 })
  const body = (await req.json().catch(() => null)) as { company?: unknown; credentials?: unknown; startDate?: unknown } | null
  const company = syncCompany(body?.company)
  if (!company) return NextResponse.json({ error: 'ספק לא נתמך', code: 'UNKNOWN_COMPANY' }, { status: 400 })
  const credentials = validateCredentials(company, body?.credentials)
  if (!credentials) return NextResponse.json({ error: 'יש למלא את כל פרטי הכניסה', code: 'MISSING_FIELDS' }, { status: 400 })

  const raw = typeof body?.startDate === 'string' && DAY.test(body.startDate) ? body.startDate : null
  const [y, m, d] = (raw ?? '').split('-').map(Number)
  const start = raw ? new Date(y, m - 1, d) : null
  const today = new Date()
  if (!start || isNaN(start.getTime()) || start < earliestStart(company, today) || start > today) {
    return NextResponse.json({ error: 'תאריך התחלה לא תקין', code: 'INVALID_START' }, { status: 400 })
  }

  const res = startRun(company, credentials, start)
  if (!res.ok) return NextResponse.json({ error: 'סנכרון אחר עדיין רץ', code: 'BUSY' }, { status: 409 })
  return NextResponse.json({ run: res.run })
}
