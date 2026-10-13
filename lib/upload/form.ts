import { NextResponse } from 'next/server'
import type { Account } from '@prisma/client'
import { getAccount } from '@/lib/db/accounts'
import { MAX_FILE_BYTES } from './preview-limits'

/**
 * Reads `file` + `accountId` from an upload form and resolves the account.
 * Returns either the inputs or the error response to send.
 */
export async function readUploadForm(
  req: Request
): Promise<{ file: File; account: Account } | { response: NextResponse }> {
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
  return { file, account }
}
