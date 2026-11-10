import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { NOT_LOCAL, maySync } from '@/lib/sync/access'
import { isReadOnly } from '@/lib/read-only'
import { SYNC_COMPANIES, VERIFIED_COMPANIES, syncCompany, validateCredentials } from '@/lib/sync/providers'
import { currentQueue, currentRun, startQueue, startRun, type LoginSource } from '@/lib/sync/runs'
import { earliestStart, sourceSummary } from '@/lib/sync/store'
import { listCredentials, readCredential, saveCredential, status as vaultStatus, VaultLockedError } from '@/lib/vault/vault'
import type { SyncCompany } from '@/lib/sync/providers'

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
/** The saved sign-in a company syncs with (the first one saved for it), or none */
async function savedLogins(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const c of await listCredentials()) if (!out.has(c.company)) out.set(c.company, c.id)
  return out
}

/** A saved sign-in, read from the vault only when the sync needs it (never sent to the browser) */
function fromVault(company: SyncCompany, credentialId: string): LoginSource {
  return async () => {
    try {
      return validateCredentials(company, await readCredential(credentialId))
    } catch (e) {
      if (e instanceof VaultLockedError) return 'VAULT_LOCKED'
      throw e
    }
  }
}

const VAULT_LOCKED = { error: 'הכספת נעולה. פותחים אותה עם Face ID או Touch ID', code: 'VAULT_LOCKED' }

export async function GET(req: Request) {
  const available = !isReadOnly() && maySync(req.headers)
  const [accounts, saved, vault] = await Promise.all([ownAccounts(), savedLogins(), vaultStatus()])
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
      /** A sign-in saved in the vault for it (ENG-92): its id only */
      savedLogin: saved.get(c.id) ?? null,
      ...(await sourceSummary(c)),
    }))
  )
  return NextResponse.json({
    available,
    companies,
    vault: { exists: vault.exists, open: vault.open },
    run: currentRun(),
    queue: currentQueue(),
  })
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * POST, one of:
 *   { company, credentials, startDate: YYYY-MM-DD, save? }  typed in; `save` also keeps them in the vault
 *   { company, saved: true, startDate }                       the sign-in saved in the vault
 *   { all: true }                                             every company with a saved sign-in, several at once (TAZRIM_SYNC_CONCURRENCY), each from where it left off
 * 409 while another sync runs; 423 when the vault is needed and locked.
 */
export async function POST(req: Request) {
  if (!maySync(req.headers)) return NextResponse.json(NOT_LOCAL, { status: 403 })
  const body = (await req.json().catch(() => null)) as
    | { company?: unknown; credentials?: unknown; startDate?: unknown; save?: unknown; saved?: unknown; all?: unknown }
    | null

  if (body?.all === true) {
    if (!(await vaultStatus()).open) return NextResponse.json(VAULT_LOCKED, { status: 423 })
    const [accounts, saved] = await Promise.all([ownAccounts(), savedLogins()])
    const items = await Promise.all(
      SYNC_COMPANIES.filter(c => saved.has(c.id) && accounts.some(a => a.kind === c.kind && a.provider === c.provider)).map(async c => {
        const [y, m, d] = (await sourceSummary(c)).defaultStart.split('-').map(Number)
        return { company: c, startDate: new Date(y, m - 1, d), login: fromVault(c, saved.get(c.id)!) }
      })
    )
    const res = await startQueue(items)
    if (!res.ok) {
      return res.code === 'BUSY'
        ? NextResponse.json({ error: 'סנכרון אחר עדיין רץ', code: 'BUSY' }, { status: 409 })
        : NextResponse.json({ error: 'אין פרטי כניסה שמורים לאף חשבון', code: 'NOTHING_SAVED' }, { status: 400 })
    }
    return NextResponse.json({ queue: res.queue })
  }

  const company = syncCompany(body?.company)
  if (!company) return NextResponse.json({ error: 'ספק לא נתמך', code: 'UNKNOWN_COMPANY' }, { status: 400 })
  if (!(await ownAccounts()).some(a => a.kind === company.kind && a.provider === company.provider)) {
    return NextResponse.json({ error: `אין חשבון של ${company.label}. מוסיפים אותו בהגדרות`, code: 'NO_ACCOUNTS' }, { status: 400 })
  }
  let credentials: Record<string, string> | null
  if (body?.saved === true) {
    const id = (await savedLogins()).get(company.id)
    if (!id) return NextResponse.json({ error: `אין פרטי כניסה שמורים ל${company.label}`, code: 'NOTHING_SAVED' }, { status: 400 })
    const login = await fromVault(company, id)()
    if (login === 'VAULT_LOCKED') return NextResponse.json(VAULT_LOCKED, { status: 423 })
    credentials = login
    if (!credentials) return NextResponse.json({ error: 'פרטי הכניסה השמורים חסרים. מעדכנים אותם בהגדרות ← כספת', code: 'MISSING_FIELDS' }, { status: 400 })
  } else {
    credentials = validateCredentials(company, body?.credentials)
    if (!credentials) return NextResponse.json({ error: 'יש למלא את כל פרטי הכניסה', code: 'MISSING_FIELDS' }, { status: 400 })
  }

  const raw = typeof body?.startDate === 'string' && DAY.test(body.startDate) ? body.startDate : null
  const [y, m, d] = (raw ?? '').split('-').map(Number)
  const start = raw ? new Date(y, m - 1, d) : null
  const today = new Date()
  if (!start || isNaN(start.getTime()) || start < earliestStart(company, today) || start > today) {
    return NextResponse.json({ error: 'תאריך התחלה לא תקין', code: 'INVALID_START' }, { status: 400 })
  }

  if (body?.save === true && body?.saved !== true) {
    try {
      // A copy: the run blanks its own once the site has answered
      // Replaces the one already saved for this company, if any
      const existing = (await listCredentials()).find(c => c.company === company.id)
      await saveCredential({
        id: existing?.id,
        company: company.id,
        label: existing?.label ?? company.label,
        accountId: existing?.accountId ?? null,
        fields: { ...credentials },
      })
    } catch (e) {
      if (e instanceof VaultLockedError) return NextResponse.json(VAULT_LOCKED, { status: 423 })
      throw e
    }
  }

  const res = startRun(company, credentials, start)
  if (!res.ok) return NextResponse.json({ error: 'סנכרון אחר עדיין רץ', code: 'BUSY' }, { status: 409 })
  return NextResponse.json({ run: res.run })
}
