import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { NOT_LOCAL, maySync } from '@/lib/sync/access'
import { isReadOnly } from '@/lib/read-only'
import { SYNC_COMPANIES, VERIFIED_COMPANIES, syncCompany, validateCredentials } from '@/lib/sync/providers'
import { currentRun, startRun } from '@/lib/sync/runs'
import { earliestStart, sourceSummary } from '@/lib/sync/store'

export const dynamic = 'force-dynamic'


/** The household's accounts a company's sync fills: not archived, its kind and provider (ENG-102). */
async function ownAccounts() {
  return prisma.account.findMany({
    where: { archived: false, kind: { in: ['BANK', 'CREDIT_CARD'] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { kind: true, provider: true, displayName: true },
  })
}

/**
 * GET: what the sync sheet shows (ENG-91): whether this device may sync, the
 * companies the household's accounts sync through (ENG-102), each with its
 * accounts, last sync and default start, and the latest run.
 */
export async function GET(req: Request) {
  const available = !isReadOnly() && maySync(req.headers)
  const accounts = await ownAccounts()
  const owned = SYNC_COMPANIES.map(c => ({
    company: c,
    names: accounts.filter(a => a.kind === c.kind && a.provider === c.provider).map(a => a.displayName),
  })).filter(o => o.names.length > 0)
  const companies = await Promise.all(
    owned.map(async ({ company: c, names }) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      fields: c.fields,
      otp: !!c.otp,
      historyMonths: c.historyMonths,
      provenMonths: c.provenMonths ?? null,
      verified: VERIFIED_COMPANIES.has(c.id),
      accounts: names,
      ...(await sourceSummary(c)),
    }))
  )
  return NextResponse.json({ available, companies, run: currentRun() })
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** POST { company, credentials, startDate: YYYY-MM-DD }: starts a sync. 409 while another one runs. */
export async function POST(req: Request) {
  if (!maySync(req.headers)) return NextResponse.json(NOT_LOCAL, { status: 403 })
  const body = (await req.json().catch(() => null)) as { company?: unknown; credentials?: unknown; startDate?: unknown } | null
  const company = syncCompany(body?.company)
  if (!company) return NextResponse.json({ error: 'ספק לא נתמך', code: 'UNKNOWN_COMPANY' }, { status: 400 })
  if (!(await ownAccounts()).some(a => a.kind === company.kind && a.provider === company.provider)) {
    return NextResponse.json({ error: `אין חשבון של ${company.label}. מוסיפים אותו בהגדרות`, code: 'NO_ACCOUNTS' }, { status: 400 })
  }
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
