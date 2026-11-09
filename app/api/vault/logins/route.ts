import { NextResponse } from 'next/server'
import { fail } from '@/lib/auth/http'
import { syncCompany, validateCredentials } from '@/lib/sync/providers'
import { isResponse, readDetails, sessionOr401, whileOpen } from '@/lib/vault/http'
import { listCredentials, saveCredential } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  return NextResponse.json({ credentials: await listCredentials() })
}

/** POST { company, label, accountId?, fields }: stores a new sign-in (the vault must be open) */
export async function POST(req: Request) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const body = (await req.json().catch(() => null)) as { company?: unknown; label?: unknown; accountId?: unknown; fields?: unknown } | null
  const company = syncCompany(body?.company)
  if (!company) return fail(400, 'חברה לא מוכרת', 'BAD_COMPANY')
  const details = await readDetails(body, company.kind)
  if (isResponse(details)) return details
  const fields = validateCredentials(company, body?.fields)
  if (!fields) return fail(400, 'חסרים פרטי כניסה', 'BAD_FIELDS')
  return whileOpen(async () => NextResponse.json(await saveCredential({ company: company.id, ...details, fields })))
}
