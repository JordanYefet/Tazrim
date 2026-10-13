import { NextResponse } from 'next/server'
import { readUploadForm } from '@/lib/upload/form'
import { importUpload } from '@/lib/upload/import'

/** Imports `file` into the account `accountId`, using that account's provider parser. */
export async function POST(req: Request) {
  const input = await readUploadForm(req)
  if ('response' in input) return input.response
  const { file, account } = input

  if (account.archived) {
    return NextResponse.json({ error: 'החשבון בארכיון', code: 'ACCOUNT_ARCHIVED' }, { status: 409 })
  }

  const result = await importUpload(account, Buffer.from(await file.arrayBuffer()), file.name)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, ...(result.code === 'DUPLICATE_FILE' ? { duplicate: true } : {}) },
      { status: result.status }
    )
  }
  const { ok: _ok, ...body } = result
  return NextResponse.json(body)
}
