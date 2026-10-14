import { NextResponse } from 'next/server'
import type { Account } from '@prisma/client'
import { getAccount } from '@/lib/db/accounts'
import { MAX_FILE_BYTES } from './preview-limits'

/** `force`: a JSON list of file-row positions to import even if they match stored rows. */
function parseForce(value: FormDataEntryValue | null): number[] | null {
  if (value === null) return []
  if (typeof value !== 'string') return null
  try {
    const list: unknown = JSON.parse(value)
    return Array.isArray(list) && list.every(n => Number.isInteger(n) && (n as number) >= 0) ? (list as number[]) : null
  } catch {
    return null
  }
}

/**
 * Reads `file` + `accountId` (+ optional `force`) from an upload form and
 * resolves the account. Returns either the inputs or the error response to send.
 */
export async function readUploadForm(
  req: Request
): Promise<{ file: File; account: Account; force: number[] } | { response: NextResponse }> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return { response: NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  }
  const file = form.get('file')
  const accountId = form.get('accountId')
  if (!file || typeof file === 'string') {
    return { response: NextResponse.json({ error: 'חסר קובץ' }, { status: 400 }) }
  }
  if (!accountId || typeof accountId !== 'string') {
    return { response: NextResponse.json({ error: 'לא נבחר חשבון' }, { status: 400 }) }
  }
  const force = parseForce(form.get('force'))
  if (!force) {
    return { response: NextResponse.json({ error: 'רשימת שורות לא תקינה' }, { status: 400 }) }
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      response: NextResponse.json(
        { error: `הקובץ גדול מדי (עד ${MAX_FILE_BYTES / 1024 / 1024}MB)`, code: 'FILE_TOO_LARGE' },
        { status: 413 }
      ),
    }
  }
  const account = await getAccount(accountId)
  if (!account) {
    return { response: NextResponse.json({ error: 'החשבון לא נמצא', code: 'ACCOUNT_NOT_FOUND' }, { status: 404 }) }
  }
  return { file, account, force }
}
