import { NextResponse } from 'next/server'
import { fail } from '@/lib/auth/http'
import { prisma } from '@/lib/db/client'
import { syncCompany, validateCredentials } from '@/lib/sync/providers'
import { isResponse, readDetails, sessionOr401, whileOpen } from '@/lib/vault/http'
import { deleteCredential, readCredential, saveCredential } from '@/lib/vault/vault'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * PUT { label, accountId?, fields }: edits a sign-in (the vault must be open).
 * A field left empty keeps its stored value: the page never shows them again.
 */
export async function PUT(req: Request, { params }: Params) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const { id } = await params
  const row = await prisma.bankCredential.findUnique({ where: { id }, select: { company: true } })
  const company = row && syncCompany(row.company)
  if (!company) return fail(404, 'לא נמצא', 'NOT_FOUND')
  const body = (await req.json().catch(() => null)) as { label?: unknown; accountId?: unknown; fields?: unknown } | null
  const details = await readDetails(body, company.kind)
  if (isResponse(details)) return details
  return whileOpen(async () => {
    const stored = (await readCredential(id)) ?? {}
    const sent = (body?.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>
    const merged = Object.fromEntries(company.fields.map(f => [f, typeof sent[f] === 'string' && sent[f] ? sent[f] : stored[f]]))
    const fields = validateCredentials(company, merged)
    if (!fields) return fail(400, 'חסרים פרטי כניסה', 'BAD_FIELDS')
    return NextResponse.json(await saveCredential({ id, company: company.id, ...details, fields }))
  })
}

/** DELETE: removes a sign-in (the vault must be open) */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const { id } = await params
  return whileOpen(async () => ((await deleteCredential(id)) ? NextResponse.json({ ok: true }) : fail(404, 'לא נמצא', 'NOT_FOUND')))
}
